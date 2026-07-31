# Inner and cross-frame error correction

Research note for Wayfinder ticket #5, “Inner and cross-frame error correction”. The local checkout has no `CONTEXT.md` or ADRs; the public issue currently describes the simulator/benchmark and evidence-threshold work. Sources below were checked on 2026-07-31 and are primary papers, standards, or implementation documentation unless explicitly labelled otherwise.

## Decision summary

For Version 1, treat the camera channel as an erasure-prone packet channel after optical demodulation:

1. Preserve a confidence value for each decoded bit/byte/symbol. A failed packet CRC, impossible geometry/header, or confidence threshold turns the complete frame into an erasure; it must not be passed to a decoder as trusted data.
2. Apply a systematic shortened Reed–Solomon code over GF(256) within each frame. A useful baseline is RS(255,239): 16 parity bytes per 239 data bytes, 6.69% parity relative to payload, correcting up to 8 unknown byte errors or 16 known byte erasures per codeword.
3. Stripe the resulting frame bytes by offset and apply a second systematic RS code across frames. Use RS(20,16) as the balanced default: 16 source frames plus 4 repair frames, 25% cross-frame parity relative to source frames, and recovery of any four erased frame symbols in each stripe. Keep RS(32,24) as a resilience profile for experiments: it recovers eight frame erasures but raises cross-frame parity to 33.33% of source data and increases generation latency/buffering.
4. Give every frame and symbol an explicit `(stream_id, generation_id, symbol_id, stripe_id, payload_length)` identity. Store valid symbols by ID, deduplicate, and decode when enough independent symbols arrive; arrival order must not matter. Release recovered application bytes in sequence order, with a bounded gap timeout.
5. Use CRC-32C to reject damaged packets cheaply and SHA-256 (or an authenticated hash/AEAD when authenticity is required) after full reassembly. Neither CRC nor SHA-256 is an error-correcting code; the hash never reconstructs missing bytes.

This is a recommendation, not a claim that the camera channel is intrinsically a binary symmetric channel. The important interface is “bytes plus confidence plus erasure reason”. It lets later work compare hard-decision RS, erasure-assisted RS, and true soft-decision LDPC without changing framing or the benchmark harness.

The balanced two-layer profile has an information rate of `(239/255) × (16/20) = 0.7506`, or about 33.2% transmitted overhead before headers and optical framing. That cost is material, but it is deterministic, explainable, and suitable for short generations. If experiments show that whole-frame loss dominates and residual byte errors are rare, disable inner parity or reduce it; if burst loss dominates, move to RS(32,24), diagonal interleaving, or a rateless code rather than silently increasing correction strength.

## What the candidate codes provide

### Reed–Solomon and BCH

Reed–Solomon (RS) codes operate on symbols in a finite field. For an RS(n,k) code with `s = n-k` parity symbols, the classical bounded-distance condition is `2e + u <= s`, where `e` is the number of unknown erroneous symbols and `u` is the number of known erasures. Thus RS(n,k) corrects `s` erasures, or half as many unknown errors. The original construction is [Reed and Solomon, 1960](https://doi.org/10.1137/0108018). The [Linux kernel Reed–Solomon library](https://cdn.kernel.org/doc/html/latest/core-api/librs.html) is a useful implementation reference: it supports configurable GF symbol sizes, error locations, erasure positions, and returns an uncorrectable result rather than pretending a failed decode succeeded.

RS is a good fit for camera frames because a frame is naturally a byte packet, an invalid frame can be represented as erasures, and GF(256) arithmetic is small-table integer code that ports cleanly to WebAssembly. It does not approach soft-decision performance by itself, but reliability information can be used by an error-and-erasure decoder or by a bounded generalized-minimum-distance (GMD) wrapper.

Binary BCH codes are cyclic binary block codes. The original constructions are [Bose and Ray-Chaudhuri, 1960](https://doi.org/10.1016/S0019-9958(60)90287-4) and [Hocquenghem, 1959](https://db.aconit.org/dbmedia_0/pdf_8/8514.pdf). BCH is attractive when the inner decoder sees individual bit decisions and needs a fixed, short, algebraic code. Its parity cost depends on block length and designed correction capability; unlike RS, it does not naturally repair a lost byte or frame unless the missing bits are explicitly marked as erasures. For Version 1, BCH is a credible future inner code for a bit-oriented optical modulation, but it adds another parameter family and does not solve cross-frame loss.

### LDPC and soft decisions

Gallager’s original [LDPC paper](https://doi.org/10.1109/tit.1962.1057683) introduced sparse parity-check matrices and iterative decoding. Modern message-passing decoders accept soft channel information, commonly log-likelihood ratios (LLRs), instead of throwing away the magnitude of the optical detector’s confidence. This is the main reason to consider LDPC for an inner code: at a given block length and rate, a good soft decoder can use weakly reliable observations that a hard decoder would turn into wrong bits or erasures. The capacity analysis for message-passing decoding is in [Richardson and Urbanke, 2001](https://doi.org/10.1109/18.910577).

The trade is implementation and finite-block behavior. A decoder stores messages on the Tanner-graph edges and performs roughly `O(I·E)` message updates for `I` iterations and `E` non-zero graph edges; actual cost depends on the selected graph, quantization, early stopping, and SIMD. There is no RS-like “correct up to exactly t errors” guarantee. Short codes are sensitive to graph construction, short cycles, trapping/absorbing sets, iteration limits, and the error floor; see the primary short-length study [Construction of short-length LDPC codes with low error floor](https://doi.org/10.1109/APCCAS.2008.4746396). A camera frame that is only a few hundred or a few thousand bits is not automatically a good LDPC block simply because a long DVB or telecom LDPC code is good.

An authoritative design precedent is [ETSI EN 302 307-1](https://www.etsi.org/deliver/etsi_en/302300_302399/30230701/01.04.01_60/en_30230701v010401p.pdf): a BCH outer check is followed by an LDPC inner code and, for several modulations, a block bit interleaver. The standard specifies normal 64,800-bit and short 16,200-bit LDPC frames, with multiple rates. This demonstrates the value of concatenation and interleaving, but those block sizes and graphs are not evidence that the same design is optimal for a browser camera link.

### Fountain codes and RaptorQ

The [FEC building block in RFC 5052](https://www.rfc-editor.org/rfc/rfc5052.html) defines a useful separation: an FEC scheme carries symbol identity and ancillary information around an FEC code. It also defines a symbol as a unit that is either completely received or completely lost, which matches a CRC-gated camera frame.

[RFC 6330](https://www.rfc-editor.org/rfc/rfc6330.html) standardizes systematic RaptorQ. Source symbols have ESI values `0..K-1`; repair symbols continue from `K`, so the receiver can accept source and repair symbols in any order. The code supports source blocks from 1 to 56,403 symbols, but pads `K` to an extended `K'` for decoding. The normative recovery targets are unusually useful for budgeting: with uniformly selected ESIs, `K'` received symbols have at most 1% average failure probability, `K'+1` at most 0.01%, and `K'+2` at most 0.0001% (the RFC continues with a tighter target for additional overhead). These are probabilistic targets, not the deterministic MDS guarantee of RS, and the receiver must still verify the reconstructed object.

RaptorQ is attractive when the sender cannot predict loss, retransmission is undesirable, and an object can be split into a sufficiently large source block. It is less attractive for a small optical frame: the precode, GF(256) operations, equation bookkeeping, and Gaussian-elimination/inactivation phase cost more memory and code than RS. RFC 6330 explicitly notes that solving the received linear system is the part where the choice of algorithm has a major effect on computational efficiency. A public [C++11 libRaptorQ implementation](https://github.com/LucaFulchir/libRaptorQ) is useful for compatibility tests, but it is not a standards authority and its README warns that its release/platform support is limited.

For a continuous stream, [RFC 8681](https://www.rfc-editor.org/rfc/rfc8681.html) specifies sliding-window random linear codes over GF(2) and GF(256). The receiver maintains variables for source symbols and equations for repair symbols, recovering symbols whenever the linear system has sufficient rank. This naturally tolerates out-of-order arrival and avoids fixed generation boundaries, but window size directly controls latency, memory, and Gaussian-elimination cost. RFC 8681 recommends checking maximum encoding/decoding time and memory for the chosen window; this is the right later-stage design if fixed generations cause unacceptable head-of-line delay.

## Interleaving and burst/frame loss

Interleaving is not additional parity. It permutes symbols so a contiguous physical burst becomes smaller separated losses in a codeword. ETSI’s block interleaver is a concrete standard example. For this camera channel, distinguish two cases:

- A burst of wrong pixels or bits inside a successfully framed image becomes byte errors/erasures. Inner interleaving can spread the burst before the inner code sees it.
- A missing or CRC-invalid optical frame is a whole-symbol erasure to the cross-frame code. Inner bit interleaving cannot repair it. Cross-frame parity or a rateless stream code must provide the missing information.

The V1 frame scheduler should therefore interleave *which generation/stripe is transmitted next*, not merely shuffle bytes. A simple depth-4 schedule can place symbols from four generations in round-robin order. It increases the time until one generation is complete and requires four-generation buffering, but it turns a physical run of losses into smaller erasure counts per generation when the burst is shorter than the schedule span. The benchmark must measure both no interleaving and this schedule; do not assume that an interleaver helps if the optical impairment loses an entire camera exposure window that covers all scheduled lanes.

For each generation and stripe, the deterministic RS bound gives an immediate acceptance test:

| Profile | Source/total frames | Cross-frame parity | Whole-frame erasures recovered per stripe | Cross-frame rate |
| --- | ---: | ---: | ---: | ---: |
| Balanced V1 | 16/20 | 4 frames | 4 | 0.80 |
| Resilience | 24/32 | 8 frames | 8 | 0.75 |
| Low overhead experiment | 24/28 | 4 frames | 4 | 0.857 |

The “recovered” column is exact for known erasures, provided the erasures are within the same codeword. A fifth erased frame in the balanced profile is not a graceful degradation: the receiver should report that generation incomplete, not emit guessed bytes.

## Packet integrity versus correction

Use a fast integrity check at the smallest independently recoverable unit. [RFC 4960](https://www.rfc-editor.org/rfc/rfc4960.html) specifies CRC-32C and requires an invalid packet checksum to be treated as invalid; [RFC 3720](https://www.rfc-editor.org/rfc/rfc3720.html) makes the important distinction that CRC digests have error-detection significance only. The proposed frame CRC covers the header fields that identify the symbol and the optical payload. A CRC failure converts the frame to an erasure before cross-frame decoding.

After all FEC and reassembly, calculate SHA-256 over the original file or object and compare it with the expected digest. [NIST FIPS 180-4](https://csrc.nist.gov/pubs/fips/180-4/upd1/final) defines SHA-256 as a message-digest algorithm whose digest detects whether a message changed. SHA-256 detects an undetected FEC failure; it cannot infer which bytes were missing or generate replacements. If an active attacker is in scope, use an authenticated construction such as an AEAD tag; [RFC 9001](https://www.rfc-editor.org/rfc/rfc9001.html) documents the separation between packet protection/authentication and transport mechanics. A bare SHA-256 value delivered over the same unauthenticated optical channel is not an authenticity proof.

## Browser and WebAssembly portability

The [WebAssembly portability guidance](https://webassembly.org/docs/portability/) makes byte-addressable memory and 8-bit bytes part of the portability assumptions. That maps well to GF(256) RS, CRC-32C, bitmaps, and XOR. A portable baseline should use fixed-width integer arithmetic, explicit endianness, bounded allocations, and no platform threads. The [WebAssembly specification](https://webassembly.github.io/spec/core/) and SIMD extension can support vectorized XOR/table work, but SIMD and threads should be optional feature paths with a scalar fallback; do not make decoder correctness depend on them.

Relative portability ranking:

1. CRC-32C, SHA-256, RS erasure decoding, and fixed-depth interleaving: small deterministic state, straightforward scalar WASM, easy cross-language test vectors.
2. BCH with a fixed polynomial: still portable, but more bit packing and parameter validation; soft BCH/GMD is a separate algorithm.
3. LDPC: portable in principle, but graph storage, LLR quantization, iteration scheduling, memory traffic, and SIMD determine performance. A JS fallback may be too slow for large camera objects.
4. RaptorQ/RLC: portable in principle, but large symbol matrices, GF(256) multiplies, rank tracking, and elimination/inactivation make peak memory and latency sensitive to source-block/window size.

Use the same golden vectors in native and WASM builds and record decoder allocations, wall-clock decode time, and maximum live bytes. Do not compare only encoded bitrate: a slower code that forces a UI-visible stall can have lower verified goodput.

## Out-of-order streaming state machine

The receiver should maintain, per `(stream_id, generation_id)`, a bitmap of received symbol IDs, CRC status, confidence/erasure reason, and a bounded symbol store. On each valid packet:

1. Validate framing and CRC-32C.
2. Reject duplicate IDs or retain only the first valid copy according to a deterministic policy.
3. Insert the symbol by ID, regardless of arrival order.
4. Attempt inner correction for the symbol/frame and then cross-frame decode when rank/known-symbol count is sufficient.
5. Verify the reconstructed frame/object hash before exposing it.
6. Advance the application delivery cursor only across contiguous verified output; retain later recovered data until the gap closes or a deadline reports loss.

This is a generation-based version of the symbol identity and repair-payload approach in RFC 5052/RFC 6330. It gives deterministic memory bounds and simple tests. A later sliding-window RLC mode can preserve the same packet identity and integrity contract while replacing fixed-generation RS with a moving equation set.

## Benchmark matrix and evidence gates

The simulator for ticket #5 should report raw optical bitrate, encoded bitrate, recovered payload rate, verified original-file goodput, compression-adjusted throughput, encode/decode CPU time, peak memory, generation latency, and compatibility mode. Every result should include code profile, symbol size, generation size, interleaver depth, confidence threshold, browser/WASM feature set, and seed.

Required fixtures:

- no impairment; isolated bit/byte errors; low-confidence but numerically correct symbols;
- random frame erasures at several rates;
- contiguous frame-loss bursts with measured burst length, including exactly at and one beyond each code’s erasure bound;
- duplicated, delayed, reordered, and interleaved packets;
- bad header, bad CRC, wrong symbol ID, truncated payload, and valid-looking but altered payload;
- final SHA-256 mismatch after an intentionally uncorrectable decode.

Retention gates should be explicit: 100% recovery for deterministic fixtures within the stated `2e+u <= s` bound; zero verified-success results for corrupted/unrecoverable fixtures; monotonic goodput/latency curves across loss rates; and a recorded failure rather than silent output whenever rank or parity is insufficient. Claims about LDPC or RaptorQ should use Monte Carlo confidence intervals because their failure behavior is probabilistic and decoder-specific. Claims about optical performance should include both independent-error and burst-loss models; an AWGN-like bit-error result alone is not evidence for camera-frame loss recovery.

## Sources

- Reed and Solomon, “Polynomial Codes Over Certain Finite Fields,” SIAM, 1960: [DOI](https://doi.org/10.1137/0108018).
- Bose and Ray-Chaudhuri, “On a class of error correcting binary group codes,” *Information and Control*, 1960: [DOI](https://doi.org/10.1016/S0019-9958(60)90287-4).
- Hocquenghem, “Codes correcteurs d’erreurs,” 1959: [archival scan](https://db.aconit.org/dbmedia_0/pdf_8/8514.pdf).
- Gallager, “Low-density parity-check codes,” IEEE, 1962: [DOI](https://doi.org/10.1109/tit.1962.1057683).
- Forney, “Generalized minimum distance decoding,” 1966: [NASA NTRS record](https://ntrs.nasa.gov/citations/19660059847).
- Watson, Luby, and Vicisano, RFC 5052, “Forward Error Correction (FEC) Building Block”: [RFC Editor](https://www.rfc-editor.org/rfc/rfc5052.html).
- Luby et al., RFC 6330, “RaptorQ FEC Scheme”: [RFC Editor](https://www.rfc-editor.org/rfc/rfc6330.html).
- Roca et al., RFC 8681, “Sliding Window Random Linear Code (RLC) Forward Erasure Correction”: [RFC Editor](https://www.rfc-editor.org/rfc/rfc8681.html).
- ETSI EN 302 307-1, DVB-S2 channel coding and modulation: [official PDF](https://www.etsi.org/deliver/etsi_en/302300_302399/30230701/01.04.01_60/en_30230701v010401p.pdf).
- Linux kernel, “Reed-Solomon Library Programming Interface”: [kernel documentation](https://cdn.kernel.org/doc/html/latest/core-api/librs.html).
- Stewart, RFC 4960, “Stream Control Transmission Protocol,” CRC-32C and packet validation: [RFC Editor](https://www.rfc-editor.org/rfc/rfc4960.html).
- NIST FIPS 180-4, “Secure Hash Standard”: [NIST publication](https://csrc.nist.gov/pubs/fips/180-4/upd1/final).
- WebAssembly Community Group, “Portability” and Core Specification: [portability](https://webassembly.org/docs/portability/), [specification](https://webassembly.github.io/spec/core/).

