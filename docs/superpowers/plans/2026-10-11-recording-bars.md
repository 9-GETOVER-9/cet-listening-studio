# Local recording sound bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Show real microphone activity in the existing locally saved NCE recording panel.

**Architecture:** Use the recorder's existing stream for a disposable Web Audio analyser. Prepare the audio context during the start-button gesture; analyser failure must leave recording usable. Keep IndexedDB persistence, permissions, visibility cancellation and PRO gating intact.

**Tech Stack:** React, TypeScript, MediaRecorder, Web Audio, Vitest, existing Chrome.

### Task 1: Stream meter and panel

Files: modify `src/lib/localRecorder.ts`, `src/lib/localRecorder.test.ts`, `src/components/NCERecordingPanel.tsx`; create `src/lib/recordingMeter.ts`, `src/lib/recordingMeter.test.ts` and `src/components/NCERecordingPanel.test.tsx`.

- [ ] Add tests before implementation for meter silence, nonzero samples, clamped heights, disposal and late stream access. Run `D:\node.exe node_modules/vitest/vitest.mjs run src/lib/localRecorder.test.ts src/lib/recordingMeter.test.ts`; initially expect missing meter module.
- [ ] Expose `get activeStream(): MediaStream | null { return this.stream ?? null }` on LocalRecorder. Implement a meter with `prepare()`, `attach(stream)` and `dispose()`; prepare creates/resumes AudioContext in the click handler, attach uses `createMediaStreamSource` connected only to an analyser, each animation frame returns bounded heights from RMS of time-domain samples, dispose disconnects/closes idempotently.
- [ ] Add 40 bars in a responsive panel, with a steady recording indicator and text `正在录音`. Silence stays flat. Sample while recording via requestAnimationFrame; stop/saving/cancel/background/unmount clean up the meter. If Web Audio fails, show `声音条纹暂不可用，录音仍在进行` and keep the stop button available. Do not request a second stream or add a timer, simulation, cloud service or personal speech recognition.
- [ ] Run related tests, whole Vitest suite and `D:\node.exe node_modules/typescript/bin/tsc -b` followed by `D:\node.exe node_modules/vite/bin/vite.js build`. Review specification then code quality using separate reviewers. Parent explicitly stages reviewed files and commits `功能：新增本地录音声音条纹` on the existing unmerged NCE feature branch.
- [ ] Parent checks actual panel in an isolated browser using synthetic MediaStream, confirms speaking/silence, permissions/cancellation, persistence, track cleanup, no recording upload and 375px layout. Release only frontend with the existing deployment script and verify public hashes and preserved data.
