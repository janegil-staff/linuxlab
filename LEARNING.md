# Linux Learning mode

The wedge: a safe, disposable Linux sandbox where a beginner learns by *doing*,
on their phone. The app verifies each task by running a check command inside the
learner's own container — so it confirms they really did it, not just read about
it. This is the part Termius/Blink don't do.

## How a lesson works

1. Learner opens a lesson → sees explanation + task.
2. Taps "Open terminal" → gets a real sandbox shell, tries the command.
3. Returns, taps "Check my work" → backend runs the lesson's `check` command
   inside their active container (`docker exec`) and looks for `pass`.
4. Pass → ✓. Fail → encouraged to try again.

## Authoring lessons (the real ongoing work)

Lessons are pure data in `src/lib/lessons.js`. Add an object to `LESSONS`:

```js
{
  id: "4-list-files",
  title: "List files",
  explanation: "`ls` lists what's in the current folder...",
  task: "List the files in your home folder (hint: ls)",
  check: 'ls ~ >/dev/null 2>&1 && echo PASS',   // runs IN the container
  pass: "PASS",
  hint: "Run:  ls",
}
```

The `check` is the heart: a shell command that succeeds (prints `pass`) only if
the learner did the task. Examples:
- created a dir:   `test -d ~/x && echo PASS`
- file has text:   `grep -qx hi ~/f.txt && echo PASS`
- ran a program:   check its side effect, not that they "typed" it.

No new code is needed per lesson — just data. The sustained work of this product
is writing a good, gentle *sequence* of these (20–40 for a real curriculum) and
the beginner UX around them.

## Status

- Backend: lesson list + verify endpoints, 3 starter lessons (validated).
- App: Lessons list, Lesson screen with practice + check loop.
- NOT yet: progress tracking/persistence, more lessons, onboarding, the full
  curriculum. This is a working proof of the core loop, not a finished course.

## Update: 10-lesson curriculum + two verification styles

The curriculum is now 10 self-contained lessons (pwd → ls → mkdir → cd → create
file → cat → cp → mv → rm → append). Each lesson is independent — its task sets
up whatever it needs — so learners can do them in any order.

Two ways a lesson's `check` verifies (both just run as the check command):

- **side-effect** — inspect the filesystem for what the task should have created
  / moved / deleted. Most robust. Example: `test -d ~/myproject && echo PASS`.
- **history** — for commands that leave no filesystem trace (cd, ls, cat, pwd,
  man), confirm the command was *run* by grepping `~/.bash_history`:
  `grep -qE "(^| )pwd( |$)" ~/.bash_history && echo PASS`.

For history checks to work, the sandbox image writes history immediately
(`PROMPT_COMMAND="history -a"` in .bashrc) — so rebuild the image after pulling:

    docker build -t qup-terminal-sandbox:latest ./sandbox

All 10 checks were validated against correct AND incorrect states (no false
passes). To add more lessons, append to LESSONS in src/lib/lessons.js using
whichever check style fits — no code changes needed.

## Curriculum plan — ~50 exercises across 8 units

Target: a complete beginner course of ~50 well-verified exercises (NOT a giant
unverified bank). 10 done so far. Units defined in UNITS (src/lib/lessons.js);
tag each exercise with its `unit` id. The app groups the list by unit and shows
per-unit progress (done/total).

1. Getting around (8)   — pwd✓ ls✓ ls-l ls-a cd✓ cd.. cd~ nested-dirs
2. Files & folders (10) — mkdir✓ create✓ cat✓ cp✓ mv✓ rm✓ append✓ mkdir-p rmdir touch
3. Viewing & reading (6)— head tail less wc file cat-multi
4. Searching (6)        — grep grep-i grep-r find-name find-type which
5. Pipes & redirection (6) — pipe ls|grep sort uniq >vs>> 2>
6. Permissions (6)      — rwx chmod-num chmod+x chmod-sym chown make-executable
7. Processes & system (5) — ps top kill df/du env
8. Editing & scripting (5)— nano write-script run-script vars loop

≈52 total, ~42 left to author. Write in careful batches; validate each check
against correct AND incorrect states before shipping (no false passes). Mix
side-effect checks (file artifacts) and history checks (traceless commands).

## COMPLETE — 50 exercises across all 8 units

Full beginner curriculum authored and check-validated (in bash, against correct
AND incorrect states). Counts: Getting around 7, Files 9, Viewing 7, Searching 6,
Pipes 6, Permissions 6, Processes 5, Scripting 4 = 50.

IMPORTANT — not yet device-tested. All checks pass in a local bash sandbox, but
have NOT run against the live container. Before relying on them:
1. Rebuild the image:  docker build -t qup-terminal-sandbox:latest ./sandbox
2. Restart backend, start a FRESH session.
3. Spot-test across units — especially:
   - history checks (pwd, ls -l, which, ps, top, nano)
   - stat-based perms (chmod 644 → uses `stat -c %a`, Linux form, container-correct)
   - seq/printf-based (head, tail, sort, uniq)
   - the run-a-script ones (37, 45) — chmod +x + ./run
Watch for any environment difference (like the earlier tmpfs/history issue) that
could affect a whole category at once.
