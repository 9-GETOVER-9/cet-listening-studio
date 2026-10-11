# IELTS chapter one Anki export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Export the complete existing chapter-one corpus in the approved multiple-choice Anki style.

**Architecture:** Offline Python exporter reads ignored corpus JSON and tracked templates, writes ignored APKG, manifest and HTML preview. Stable model/deck IDs and source-based GUIDs make future exports updateable. Anki controls scheduling; JavaScript only grades choices. Preserve 376 main groups, category counts 20/100/256, 375 scored notes and one clearly labelled pending reference note; do not fabricate 538 groups.

**Tech Stack:** Existing Python/genanki, SQLite, unittest, standalone HTML/ES5 JavaScript.

### Task 1: Export and validate

Files: create `tools/export_ielts_anki.py`, `tools/test_export_ielts_anki.py`, `tools/anki_templates/front.html`, `back.html`, `style.css`, `choices.js`, `docs/IELTS_ANKI_EXPORT.md`. Read approved `output/prototypes/2026-10-11-recording-anki/build_sample.py` for visual baseline without executing its top-level side effects.

- [ ] Write unittest fixtures for duplicate IDs, expression normalization, escaped fields, pending reference isolation, structural relationship prompts and deterministic GUIDs. Run `D:\JIQIXUEXI\python.exe -m unittest discover -s tools -p test_export_ielts_anki.py`; expect missing exporter before implementation.
- [ ] Implement `export_corpus(source: Path, output: Path)` and an argparse entry point accepting `--source` and `--output`. Preserve all expressions on the back; include all correct choices in each scored question and two distinct distractors from other nonpending entries, excluding known correct texts. Prompt explicitly asks for the source's listed correspondence and names its relationship; pending content never becomes a graded synonym question.
- [ ] Use the approved white card and blue action; selected correct green, wrong AND omitted red with explicit labels. A static back independently shows all answers, meaning, relation and source ID. Add no automatic Anki rating. Keep JS ES5 scoped to current card and support reset and a no-script fallback.
- [ ] Write combined `IELTS538-第一章完整牌组.apkg`, category subdecks, per-category APKG files, browsable `index.html` and `manifest.json` under `output/anki/ielts-reading-538-chapter1/`. Manifest records source SHA256, 376/375/1 counts, 20/100/256 categories, source statuses, stable GUIDs and ZIP/database validation. All generated materials stay out of Git.
- [ ] Run unit tests, actual export and independent SQLite/ZIP checks for one card per source group, complete answers, pending isolated, no media, tags/subdecks and GUID consistency. Parent browser tests preview at 320/375px and interaction correctness, then spec review, quality review and overall review. Commit source only as `功能：新增雅思阅读Anki牌组导出` on `feature/雅思Anki导出`, based on latest origin/dev; create a standalone PR to dev without merging stable branches.

### Parent closeout

- [ ] Verify remote/account, fetch integration state, explicit Git staging and source-only push; attach created PR. Deliver local full APKG and truthful count explanation. Do not claim actual Anki-client import or physical phone microphone testing without evidence. Update only durable shared project memory through prewrite/claim/closeout.
