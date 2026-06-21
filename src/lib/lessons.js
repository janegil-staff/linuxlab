// src/lib/lessons.js
// Linux-learning curriculum + verification. A lesson is pure data; the engine
// runs `check` to look for `pass`.
//
// Two verification styles (both just run as `check`):
//   • side-effect — inspect the filesystem for what the task should have made.
//   • history     — grep ~/.bash_history to confirm a command was RUN (needed
//                   for traceless commands like cd, ls, cat, pwd, man).
//
// Every lesson is SELF-CONTAINED: its task sets up anything it needs, so a
// learner can do lessons in any order. Add lessons by appending here — no code.
//
// VERIFICATION_E2B_V1 — verification now runs the lesson's `check` inside the
// learner's own E2B sandbox via the backend, replacing the parked Docker path.
// The backend reconnects to the running sandbox by id (Sandbox.connect) and
// runs `check` with sandbox.commands.run(). Filesystem checks ($HOME) and
// history checks (~/.bash_history) both map onto that sandbox.
//
// IMPORTANT — history checks require the PTY to flush history continuously.
// Interactive bash only writes ~/.bash_history on exit, and commands.run()
// spawns a SEPARATE non-interactive shell that can't see the PTY's in-memory
// history. So when you start the PTY session, set:
//     export PROMPT_COMMAND='history -a'
// (and optionally `shopt -s histappend`) so every Enter flushes the command to
// ~/.bash_history immediately. Then the backend's commands.run grep sees it.
// See ensurePtyHistoryFlush() below for the exact snippet to inject at PTY
// startup.

// Course units (the topic breakdown). Lessons reference a unit by id. Units
// give the curriculum structure and let the app group + show per-unit progress.
// Author new exercises by adding them to LESSONS with the matching unit id.
export const UNITS = [
  { id: "u1-getting-around", title: "Getting around", order: 1 },
  { id: "u2-files", title: "Files & folders", order: 2 },
  { id: "u3-viewing", title: "Viewing & reading", order: 3 },
  { id: "u4-searching", title: "Searching", order: 4 },
  { id: "u5-pipes", title: "Pipes & redirection", order: 5 },
  { id: "u6-permissions", title: "Permissions", order: 6 },
  { id: "u7-processes", title: "Processes & system", order: 7 },
  { id: "u8-scripting", title: "Editing & scripting", order: 8 },
];

export const LESSONS = [
  {
    id: "01-pwd",
    unit: "u1-getting-around",
    title: "Where am I?",
    explanation:
      "The shell always has a 'current folder' you're working in. The command " +
      "`pwd` (print working directory) tells you where that is. Run it to see " +
      "your current location.",
    task: "Run:  pwd",
    check: 'grep -qE "(^| )pwd( |$)" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "Type pwd and press Enter.",
  },
  {
    id: "02-ls",
    unit: "u1-getting-around",
    title: "What's here?",
    explanation:
      "`ls` (list) shows the files and folders in your current location. It's " +
      "probably the command you'll use most. Try it.",
    task: "Run:  ls",
    check: 'grep -qE "(^| )ls( |$)" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "Type ls and press Enter.",
  },
  {
    id: "02b-ls-l",
    unit: "u1-getting-around",
    title: "See the details",
    explanation:
      "`ls -l` shows a 'long' listing — one item per line with extra detail: " +
      "permissions, owner, size, and date. The `-l` is an option (a flag) that " +
      "changes how ls behaves.",
    task: "Run:  ls -l",
    check: 'grep -qE "ls +-[a-z]*l" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "Type ls -l (that's a lowercase L) and press Enter.",
  },
  {
    id: "02c-ls-a",
    unit: "u1-getting-around",
    title: "Show hidden files",
    explanation:
      "Files whose name starts with a dot (like `.bashrc`) are hidden by " +
      "default. `ls -a` shows ALL files, including the hidden ones. Try it.",
    task: "Run:  ls -a",
    check: 'grep -qE "ls +-[a-z]*a" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "Type ls -a and press Enter. You can also combine flags: ls -la",
  },
  {
    id: "02d-cd-up",
    unit: "u1-getting-around",
    title: "Go up a level",
    explanation:
      "`..` means 'the folder above this one' (the parent). So `cd ..` moves " +
      "you up one level. It's how you back out of a folder you've entered.",
    task: "Move up one folder with:  cd ..",
    check: 'grep -qE "cd +\\.\\." ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "Type cd .. (cd, space, two dots) and press Enter.",
  },
  {
    id: "02e-cd-home",
    unit: "u1-getting-around",
    title: "Jump home",
    explanation:
      "`~` (tilde) is a shortcut for your home folder. No matter where you are, " +
      "`cd ~` (or just `cd` on its own) takes you straight home.",
    task: "Go to your home folder with:  cd ~",
    check: 'grep -qE "cd +~" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "Type cd ~ (cd, space, tilde) and press Enter.",
  },
  {
    id: "03-mkdir",
    unit: "u2-files",
    title: "Make a folder",
    explanation:
      "`mkdir` (make directory) creates a new folder. Folders keep your files " +
      "organised. Create one called `myproject`.",
    task: "Create a folder called  myproject",
    check: 'test -d ~/myproject && echo PASS',
    pass: "PASS",
    hint: "Run:  mkdir myproject",
  },
  {
    id: "04-cd",
    unit: "u1-getting-around",
    title: "Move into a folder",
    explanation:
      "`cd` (change directory) moves you into a folder. Let's make a folder and " +
      "move into it, then create a file there to prove you arrived.",
    task:
      "Make a folder  lab , move into it with cd, and create a file there called  done.txt\n" +
      "(hint: mkdir lab ; cd lab ; touch done.txt)",
    check: 'test -f ~/lab/done.txt && echo PASS',
    pass: "PASS",
    hint: "mkdir lab   then   cd lab   then   touch done.txt",
  },
  {
    id: "05-create-file",
    unit: "u2-files",
    title: "Create a file with text",
    explanation:
      "`echo` prints text. The `>` symbol sends that text into a file instead " +
      "of the screen. Together they create a file with contents.",
    task: 'Create a file  hello.txt  containing the word  hi',
    check: 'grep -qx hi ~/hello.txt 2>/dev/null && echo PASS',
    pass: "PASS",
    hint: "Run:  echo hi > hello.txt",
  },
  {
    id: "06-cat",
    unit: "u3-viewing",
    title: "Read a file",
    explanation:
      "`cat` prints a file's contents to the screen. First make a file, then " +
      "read it back with cat.",
    task:
      'Create a file  note.txt  with the word  ok  in it, then read it with cat\n' +
      "(hint: echo ok > note.txt ; cat note.txt)",
    check:
      'grep -qx ok ~/note.txt 2>/dev/null && grep -qE "(^| )cat note.txt" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "echo ok > note.txt   then   cat note.txt",
  },
  {
    id: "07-cp",
    unit: "u2-files",
    title: "Copy a file",
    explanation:
      "`cp` (copy) duplicates a file. The first name is the source, the second " +
      "is the copy.",
    task:
      'Make a file  src.txt  containing  data , then copy it to  copy.txt\n' +
      "(hint: echo data > src.txt ; cp src.txt copy.txt)",
    check: 'grep -qx data ~/copy.txt 2>/dev/null && test -f ~/src.txt && echo PASS',
    pass: "PASS",
    hint: "echo data > src.txt   then   cp src.txt copy.txt",
  },
  {
    id: "08-mv",
    unit: "u2-files",
    title: "Rename a file",
    explanation:
      "`mv` (move) renames a file — or moves it to another folder. Here you'll " +
      "use it to rename.",
    task:
      'Make a file  old.txt , then rename it to  new.txt\n' +
      "(hint: touch old.txt ; mv old.txt new.txt)",
    check: 'test -f ~/new.txt && ! test -f ~/old.txt && echo PASS',
    pass: "PASS",
    hint: "touch old.txt   then   mv old.txt new.txt",
  },
  {
    id: "09-rm",
    unit: "u2-files",
    title: "Delete a file",
    explanation:
      "`rm` (remove) deletes a file. Be careful — there's no recycle bin! " +
      "Practise on a throwaway file.",
    task:
      'Make a file  trash.txt , then delete it\n' +
      "(hint: touch trash.txt ; rm trash.txt)",
    check:
      'grep -qE "(^| )touch trash.txt" ~/.bash_history && ! test -f ~/trash.txt && echo PASS',
    pass: "PASS",
    hint: "touch trash.txt   then   rm trash.txt",
  },
  {
    id: "10-append",
    unit: "u2-files",
    title: "Add to a file",
    explanation:
      "A single `>` overwrites a file. Double `>>` *appends* — it adds to the " +
      "end without erasing what's there. Build a two-line file with it.",
    task:
      'Create  list.txt  with two lines: first  apple  then append  banana\n' +
      "(hint: echo apple > list.txt ; echo banana >> list.txt)",
    check:
      'test "$(wc -l < ~/list.txt 2>/dev/null)" = "2" && grep -qx apple ~/list.txt && grep -qx banana ~/list.txt && echo PASS',
    pass: "PASS",
    hint: "echo apple > list.txt   then   echo banana >> list.txt",
  },
  {
    id: "11-mkdir-p",
    unit: "u2-files",
    title: "Make nested folders",
    explanation:
      "Normally `mkdir` only makes one folder, and fails if the parent doesn't " +
      "exist. `mkdir -p` creates a whole chain of folders at once, making any " +
      "missing parents along the way.",
    task:
      "Create the nested path  a/b/c  in one command\n" +
      "(hint: mkdir -p a/b/c)",
    check: "test -d ~/a/b/c && echo PASS",
    pass: "PASS",
    hint: "Run:  mkdir -p a/b/c",
  },
  {
    id: "12-rmdir",
    unit: "u2-files",
    title: "Remove an empty folder",
    explanation:
      "`rmdir` removes a folder — but only if it's empty. It's a safer cousin " +
      "of `rm`, because it refuses to delete a folder that still has things in " +
      "it. Make an empty folder, then remove it with rmdir.",
    task:
      "Make a folder  empty , then remove it with rmdir\n" +
      "(hint: mkdir empty ; rmdir empty)",
    check:
      'grep -qE "rmdir +empty" ~/.bash_history && ! test -d ~/empty && echo PASS',
    pass: "PASS",
    hint: "mkdir empty   then   rmdir empty",
  },
  {
    id: "13-touch",
    unit: "u2-files",
    title: "Create an empty file",
    explanation:
      "`touch` creates an empty file if it doesn't exist (and updates its " +
      "timestamp if it does). It's the quickest way to make a blank file.",
    task:
      "Create an empty file called  marker\n" +
      "(hint: touch marker)",
    check: "test -f ~/marker && echo PASS",
    pass: "PASS",
    hint: "Run:  touch marker",
  },
  {
    id: "14-head",
    unit: "u3-viewing",
    title: "See the start of a file",
    explanation:
      "`head` shows the first lines of a file (10 by default, or use `-n` to " +
      "pick how many). Great for peeking at the top of a big file without " +
      "opening the whole thing.",
    task:
      "Make a file  numbers.txt  with the numbers 1 to 10, then save its first " +
      "3 lines into  top.txt\n" +
      "(hint: seq 10 > numbers.txt ; head -n 3 numbers.txt > top.txt)",
    check:
      'test "$(wc -l < ~/top.txt 2>/dev/null)" = "3" && head -n1 ~/top.txt | grep -qx 1 && tail -n1 ~/top.txt | grep -qx 3 && echo PASS',
    pass: "PASS",
    hint: "seq 10 > numbers.txt   then   head -n 3 numbers.txt > top.txt",
  },
  {
    id: "15-tail",
    unit: "u3-viewing",
    title: "See the end of a file",
    explanation:
      "`tail` is the opposite of head — it shows the LAST lines of a file. It's " +
      "handy for checking the most recent entries in a log.",
    task:
      "Make a file  numbers.txt  with the numbers 1 to 10, then save its last " +
      "3 lines into  bottom.txt\n" +
      "(hint: seq 10 > numbers.txt ; tail -n 3 numbers.txt > bottom.txt)",
    check:
      'test "$(wc -l < ~/bottom.txt 2>/dev/null)" = "3" && head -n1 ~/bottom.txt | grep -qx 8 && tail -n1 ~/bottom.txt | grep -qx 10 && echo PASS',
    pass: "PASS",
    hint: "seq 10 > numbers.txt   then   tail -n 3 numbers.txt > bottom.txt",
  },
  {
    id: "16-less",
    unit: "u3-viewing",
    title: "Page through a long file",
    explanation:
      "`less` opens a file in a scrollable viewer — useful for long files. " +
      "Scroll with the arrow keys, and press `q` to quit. (Make a file first so " +
      "you have something to view.)",
    task:
      "Make a file  big.txt  (any contents), then open it with less and press q " +
      "to quit\n" +
      "(hint: seq 50 > big.txt ; less big.txt   — then press q)",
    check: 'grep -qE "(^| )less +" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "seq 50 > big.txt   then   less big.txt   (press q to exit)",
  },
  {
    id: "17-wc",
    unit: "u3-viewing",
    title: "Count lines",
    explanation:
      "`wc` (word count) counts lines, words, and characters. With `-l` it " +
      "counts just lines — useful for 'how many entries are in this file?'",
    task:
      "Make a file  lines.txt  with 5 lines, then save its line count into  count.txt\n" +
      "(hint: seq 5 > lines.txt ; wc -l < lines.txt > count.txt)",
    check: 'grep -qE "(^| )5$" ~/count.txt 2>/dev/null && echo PASS',
    pass: "PASS",
    hint: "seq 5 > lines.txt   then   wc -l < lines.txt > count.txt",
  },
  {
    id: "18-file",
    unit: "u3-viewing",
    title: "What kind of file is it?",
    explanation:
      "`file` inspects a file and tells you what type it is (text, image, " +
      "program, …) by looking at its contents — not just its name. Try it on " +
      "any file.",
    task:
      "Make a file  thing.txt , then run file on it\n" +
      "(hint: touch thing.txt ; file thing.txt)",
    check: 'grep -qE "(^| )file +" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "touch thing.txt   then   file thing.txt",
  },
  {
    id: "19-cat-multi",
    unit: "u3-viewing",
    title: "Join files together",
    explanation:
      "`cat` can take several files at once and print them one after another. " +
      "Combined with `>`, that lets you join files into a new one.",
    task:
      "Make  one.txt  containing  alpha  and  two.txt  containing  beta , then " +
      "join them into  both.txt\n" +
      "(hint: echo alpha > one.txt ; echo beta > two.txt ; cat one.txt two.txt > both.txt)",
    check:
      'grep -qx alpha ~/both.txt 2>/dev/null && grep -qx beta ~/both.txt 2>/dev/null && test "$(wc -l < ~/both.txt)" = "2" && echo PASS',
    pass: "PASS",
    hint: "cat one.txt two.txt > both.txt",
  },
  {
    id: "20-grep",
    unit: "u4-searching",
    title: "Search inside a file",
    explanation:
      "`grep` finds lines that contain a word or pattern. Give it the word and " +
      "a file, and it prints every matching line — the workhorse of searching.",
    task:
      "Make  fruits.txt  with three lines (apple, banana, cherry), then save the " +
      "line containing  banana  into  found.txt\n" +
      "(hint: printf 'apple\\nbanana\\ncherry\\n' > fruits.txt ; grep banana fruits.txt > found.txt)",
    check:
      'grep -qx banana ~/found.txt 2>/dev/null && test "$(wc -l < ~/found.txt)" = "1" && echo PASS',
    pass: "PASS",
    hint: "grep banana fruits.txt > found.txt",
  },
  {
    id: "21-grep-i",
    unit: "u4-searching",
    title: "Search ignoring case",
    explanation:
      "By default grep cares about capital letters: `apple` won't match " +
      "`Apple`. The `-i` flag makes grep ignore case, matching either.",
    task:
      "Make  greet.txt  containing the line  Hello , then use grep -i to find " +
      "it searching for lowercase  hello , saving the result into  ci.txt\n" +
      "(hint: echo Hello > greet.txt ; grep -i hello greet.txt > ci.txt)",
    check:
      'grep -qx Hello ~/ci.txt 2>/dev/null && grep -qE "grep +-i" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "echo Hello > greet.txt   then   grep -i hello greet.txt > ci.txt",
  },
  {
    id: "22-grep-r",
    unit: "u4-searching",
    title: "Search through folders",
    explanation:
      "`grep -r` (recursive) searches inside every file in a folder and its " +
      "sub-folders — perfect for 'where did I write that, somewhere in this " +
      "project?'",
    task:
      "Make a folder  proj  with a file inside containing the word  needle , " +
      "then search the whole folder with grep -r\n" +
      "(hint: mkdir -p proj ; echo 'needle here' > proj/note.txt ; grep -r needle proj)",
    check: 'grep -qE "grep +-r" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "grep -r needle proj",
  },
  {
    id: "23-find-name",
    unit: "u4-searching",
    title: "Find a file by name",
    explanation:
      "`find` locates files by name anywhere under a folder. `find . -name X` " +
      "searches the current folder and everything below it for X.",
    task:
      "Create  target.txt  inside a nested folder, then find it and save the " +
      "result into  result.txt\n" +
      "(hint: mkdir -p hunt/deep ; touch hunt/deep/target.txt ; find . -name target.txt > result.txt)",
    check:
      'test -s ~/result.txt && grep -q target.txt ~/result.txt && echo PASS',
    pass: "PASS",
    hint: "find . -name target.txt > result.txt",
  },
  {
    id: "24-find-type",
    unit: "u4-searching",
    title: "Find only folders",
    explanation:
      "`find` can filter by type. `-type d` finds only directories (folders), " +
      "`-type f` only files. Useful when you want one but not the other.",
    task:
      "List only the folders under your current location\n" +
      "(hint: find . -type d)",
    check: 'grep -qE "find .*-type +d" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "Run:  find . -type d",
  },
  {
    id: "25-which",
    unit: "u4-searching",
    title: "Where does a command live?",
    explanation:
      "`which` tells you the full path of a command's program — e.g. " +
      "`which ls` shows where the ls program actually is on disk. Handy for " +
      "checking what will run.",
    task:
      "Find out where the  ls  command lives\n" +
      "(hint: which ls)",
    check: 'grep -qE "(^| )which +" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "Run:  which ls",
  },
  {
    id: "26-pipe",
    unit: "u5-pipes",
    title: "Connect commands with a pipe",
    explanation:
      "The pipe `|` sends the output of one command straight into another. " +
      "`ls | wc -l` feeds the file listing into wc, counting how many items " +
      "there are — without making a file in between.",
    task:
      "Make a folder  pd  with 3 files in it, then count them by piping ls into " +
      "wc -l, saving the number into  pcount.txt\n" +
      "(hint: mkdir pd ; touch pd/a pd/b pd/c ; cd pd ; ls | wc -l > ~/pcount.txt)",
    check:
      'grep -qE "(^| )3$" ~/pcount.txt 2>/dev/null && grep -qE "\\|" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "ls | wc -l > ~/pcount.txt   (run it inside the pd folder)",
  },
  {
    id: "27-ls-grep",
    unit: "u5-pipes",
    title: "Filter a listing",
    explanation:
      "Pipe `ls` into `grep` to show only the files whose names match. " +
      "`ls | grep cat` lists just the items containing 'cat'.",
    task:
      "Make a folder  gd  with files  cat.txt , dog.txt , catfish.txt , then " +
      "list only the ones containing  cat  into  gfilter.txt\n" +
      "(hint: cd gd ; ls | grep cat > ~/gfilter.txt)",
    check:
      'grep -q cat.txt ~/gfilter.txt 2>/dev/null && grep -q catfish.txt ~/gfilter.txt 2>/dev/null && ! grep -q dog.txt ~/gfilter.txt 2>/dev/null && echo PASS',
    pass: "PASS",
    hint: "ls | grep cat > ~/gfilter.txt",
  },
  {
    id: "28-sort",
    unit: "u5-pipes",
    title: "Sort lines",
    explanation:
      "`sort` puts lines in order (alphabetical by default). Give it a file and " +
      "it prints the sorted version — great for tidying lists.",
    task:
      "Make  uns.txt  with the lines  cherry , apple , banana  (in that order), " +
      "then sort it into  sorted.txt\n" +
      "(hint: printf 'cherry\\napple\\nbanana\\n' > uns.txt ; sort uns.txt > sorted.txt)",
    check:
      'head -n1 ~/sorted.txt 2>/dev/null | grep -qx apple && tail -n1 ~/sorted.txt | grep -qx cherry && echo PASS',
    pass: "PASS",
    hint: "sort uns.txt > sorted.txt",
  },
  {
    id: "29-uniq",
    unit: "u5-pipes",
    title: "Remove duplicates",
    explanation:
      "`uniq` removes adjacent duplicate lines — so it's usually paired with " +
      "sort (which groups duplicates together): `sort file | uniq`.",
    task:
      "Make  dups.txt  with repeated lines (a, a, b, b, b, c), then produce a " +
      "de-duplicated  uniq.txt  using sort and uniq\n" +
      "(hint: printf 'a\\na\\nb\\nb\\nb\\nc\\n' > dups.txt ; sort dups.txt | uniq > uniq.txt)",
    check:
      'test "$(wc -l < ~/uniq.txt 2>/dev/null)" = "3" && grep -qx a ~/uniq.txt && grep -qx b ~/uniq.txt && grep -qx c ~/uniq.txt && echo PASS',
    pass: "PASS",
    hint: "sort dups.txt | uniq > uniq.txt",
  },
  {
    id: "30-append-redirect",
    unit: "u5-pipes",
    title: "Overwrite vs append",
    explanation:
      "A reminder that matters: `>` REPLACES a file's contents, while `>>` ADDS " +
      "to the end. Mixing them up erases data — so it's worth practising the " +
      "difference.",
    task:
      "Create  log.txt  with the line  first , then APPEND a second line  second " +
      "(without erasing the first)\n" +
      "(hint: echo first > log.txt ; echo second >> log.txt)",
    check:
      'test "$(wc -l < ~/log.txt 2>/dev/null)" = "2" && head -n1 ~/log.txt | grep -qx first && tail -n1 ~/log.txt | grep -qx second && echo PASS',
    pass: "PASS",
    hint: "echo first > log.txt   then   echo second >> log.txt",
  },
  {
    id: "31-stderr",
    unit: "u5-pipes",
    title: "Capture error messages",
    explanation:
      "Normal output and ERROR output are separate streams. `2>` redirects just " +
      "the errors to a file. Run a command that fails and catch its error " +
      "message in a file.",
    task:
      "Run a command that errors (e.g. listing a folder that doesn't exist) and " +
      "send the error message into  err.txt\n" +
      "(hint: ls /does-not-exist 2> err.txt)",
    check:
      'test -s ~/err.txt 2>/dev/null && grep -qiE "no such file|cannot access" ~/err.txt && grep -qE "2>" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "ls /does-not-exist 2> err.txt",
  },
  {
    id: "32-perms-view",
    unit: "u6-permissions",
    title: "Read file permissions",
    explanation:
      "Every file has permissions shown by `ls -l` as something like " +
      "`-rwxr-xr--`. The letters mean read (r), write (w), execute (x), in " +
      "three groups: owner, group, everyone else. View them with a long listing.",
    task:
      "Make a file, then view its permissions with a long listing\n" +
      "(hint: touch file.txt ; ls -l)",
    check: 'grep -qE "ls +-[a-z]*l" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "Run:  ls -l",
  },
  {
    id: "33-chmod-num",
    unit: "u6-permissions",
    title: "Set permissions with numbers",
    explanation:
      "`chmod` changes permissions. The numeric form uses three digits: 4=read, " +
      "2=write, 1=execute, added together. So `644` means owner read+write (6), " +
      "group and others read-only (4).",
    task:
      "Make a file  perm.txt  and set its permissions to exactly  644\n" +
      "(hint: touch perm.txt ; chmod 644 perm.txt)",
    check:
      'test "$(stat -c %a ~/perm.txt 2>/dev/null)" = "644" && echo PASS',
    pass: "PASS",
    hint: "chmod 644 perm.txt",
  },
  {
    id: "34-chmod-x",
    unit: "u6-permissions",
    title: "Make a file executable",
    explanation:
      "To run a script, it needs the execute (x) permission. `chmod +x` adds it. " +
      "This is the step people forget when a script 'won't run'.",
    task:
      "Make a file  script.sh  and give it execute permission\n" +
      "(hint: touch script.sh ; chmod +x script.sh)",
    check: "test -x ~/script.sh && echo PASS",
    pass: "PASS",
    hint: "chmod +x script.sh",
  },
  {
    id: "35-chmod-sym",
    unit: "u6-permissions",
    title: "Permissions the symbolic way",
    explanation:
      "Besides numbers, chmod has a symbolic form: `u+x` adds execute for the " +
      "user (owner), `g-w` removes write for the group, and so on. It's often " +
      "clearer for small changes.",
    task:
      "Make a file  sym.sh  and add execute for the owner using the symbolic form\n" +
      "(hint: touch sym.sh ; chmod u+x sym.sh)",
    check:
      'test -x ~/sym.sh && grep -qE "chmod +u\\+x" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "chmod u+x sym.sh",
  },
  {
    id: "36-chown",
    unit: "u6-permissions",
    title: "Who owns a file?",
    explanation:
      "`chown` changes a file's owner (and `chgrp` its group). Changing owner " +
      "usually needs admin rights, but it's important to know it exists. Run it " +
      "to set the owner of a file to your own user.",
    task:
      "Make a file  owned.txt , then run chown to set its owner to  sandbox\n" +
      "(hint: touch owned.txt ; chown sandbox owned.txt)",
    check: 'grep -qE "(^| )chown +" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "chown sandbox owned.txt",
  },
  {
    id: "37-run-script",
    unit: "u6-permissions",
    title: "Write and run a script",
    explanation:
      "Putting it together: a script is a file of commands. Make it executable, " +
      "then run it with `./name`. The `./` tells the shell to run the file right " +
      "here.",
    task:
      "Make  hello.sh  that writes the word  ran  into  out.txt , make it " +
      "executable, and run it\n" +
      "(hint: printf '#!/bin/bash\\necho ran > out.txt\\n' > hello.sh ; chmod +x hello.sh ; ./hello.sh)",
    check:
      'test -x ~/hello.sh && grep -qx ran ~/out.txt 2>/dev/null && echo PASS',
    pass: "PASS",
    hint: "chmod +x hello.sh   then   ./hello.sh",
  },
  {
    id: "38-ps",
    unit: "u7-processes",
    title: "See running programs",
    explanation:
      "`ps` lists processes (running programs). `ps aux` shows all of them with " +
      "details — who started them and how much they're using. It's how you see " +
      "what's running.",
    task:
      "List the running processes\n" +
      "(hint: ps aux)",
    check: 'grep -qE "(^| )ps( |$)" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "Run:  ps aux",
  },
  {
    id: "39-top",
    unit: "u7-processes",
    title: "Watch the system live",
    explanation:
      "`top` shows a live, updating view of processes and how much CPU and " +
      "memory each uses — like a task manager for the terminal. Press `q` to " +
      "quit it.",
    task:
      "Open the live process viewer, then quit it with q\n" +
      "(hint: top   — then press q)",
    check: 'grep -qE "(^| )top( |$)|htop" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "Run:  top   (press q to exit)",
  },
  {
    id: "40-kill",
    unit: "u7-processes",
    title: "Stop a process",
    explanation:
      "Sometimes a program needs stopping. Start a long-running command in the " +
      "background with `&`, then stop it with `kill`. (`kill %1` stops the first " +
      "background job.)",
    task:
      "Start  sleep 300  in the background, then kill it\n" +
      "(hint: sleep 300 & ; then: kill %1)",
    check:
      'grep -qE "(^| )kill( |$)" ~/.bash_history && grep -qE "sleep" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "sleep 300 &   then   kill %1",
  },
  {
    id: "41-disk",
    unit: "u7-processes",
    title: "Check disk space",
    explanation:
      "`df -h` shows how much disk space is free (in human-readable sizes). " +
      "`du` shows how much space files/folders use. Essential when things fill " +
      "up.",
    task:
      "Show free disk space in human-readable form\n" +
      "(hint: df -h)",
    check: 'grep -qE "(^| )d[fu]( |$| -)" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "Run:  df -h",
  },
  {
    id: "42-env-var",
    unit: "u7-processes",
    title: "Use a variable",
    explanation:
      "The shell can store values in variables. `NAME=value` sets one, and " +
      "`$NAME` reads it back. This is the foundation of scripting.",
    task:
      "Set a variable  MYVAR  to  hello , then save its value into  var.txt\n" +
      "(hint: MYVAR=hello ; echo $MYVAR > var.txt)",
    check: 'grep -qx hello ~/var.txt 2>/dev/null && echo PASS',
    pass: "PASS",
    hint: "MYVAR=hello   then   echo $MYVAR > var.txt",
  },
  {
    id: "43-nano",
    unit: "u8-scripting",
    title: "Edit with nano",
    explanation:
      "`nano` is a friendly text editor in the terminal. Open a file, type, " +
      "then save with Ctrl-O (Enter) and exit with Ctrl-X. It's the easiest way " +
      "to edit files by hand.",
    task:
      "Open  notes.txt  in nano (you can type something, save with Ctrl-O, exit " +
      "with Ctrl-X)\n" +
      "(hint: nano notes.txt)",
    check: 'grep -qE "(^| )nano( |$)" ~/.bash_history && echo PASS',
    pass: "PASS",
    hint: "Run:  nano notes.txt   (Ctrl-O to save, Ctrl-X to exit)",
  },
  {
    id: "44-write-script",
    unit: "u8-scripting",
    title: "Write your first script",
    explanation:
      "A script starts with a 'shebang' line — `#!/bin/bash` — telling the " +
      "system to run it with bash. Below that go your commands, one per line.",
    task:
      "Create  myscript.sh  starting with the line  #!/bin/bash  followed by an " +
      "echo command\n" +
      "(hint: printf '#!/bin/bash\\necho hi\\n' > myscript.sh)",
    check:
      'head -n1 ~/myscript.sh 2>/dev/null | grep -qE "^#!/bin/bash" && echo PASS',
    pass: "PASS",
    hint: "printf '#!/bin/bash\\necho hi\\n' > myscript.sh",
  },
  {
    id: "45-script-var",
    unit: "u8-scripting",
    title: "A script with a variable",
    explanation:
      "Putting variables in a script makes it flexible. Set a variable inside " +
      "the script and use it in the output.",
    task:
      "Write and run a script that sets  NAME=world  and writes  hello world  " +
      "into  vout.txt\n" +
      "(hint: put NAME=world and echo \"hello $NAME\" > vout.txt in a script, chmod +x, run it)",
    check: 'grep -q "hello world" ~/vout.txt 2>/dev/null && echo PASS',
    pass: "PASS",
    hint: 'In the script: NAME=world  then  echo "hello $NAME" > vout.txt',
  },
  {
    id: "46-loop",
    unit: "u8-scripting",
    title: "Repeat with a loop",
    explanation:
      "A `for` loop repeats commands. `for i in 1 2 3; do ... done` runs the " +
      "body once for each value. Loops are where the terminal starts saving you " +
      "real time.",
    task:
      "Use a for loop to create three files:  loop1.txt , loop2.txt , loop3.txt\n" +
      "(hint: for i in 1 2 3; do touch loop$i.txt; done)",
    check:
      'test -f ~/loop1.txt && test -f ~/loop2.txt && test -f ~/loop3.txt && echo PASS',
    pass: "PASS",
    hint: "for i in 1 2 3; do touch loop$i.txt; done",
  },
];

export function getLesson(id) {
  return LESSONS.find((l) => l.id === id) || null;
}

// ---------------------------------------------------------------------------
// VERIFICATION (E2B) — re-enabled.
//
// We run the lesson's `check` inside the LEARNER'S OWN sandbox. The backend
// reconnects to the running sandbox by id and runs `check` non-interactively.
// Both check styles work there:
//   • filesystem checks read real disk state ($HOME) — shared with the PTY.
//   • history checks read ~/.bash_history — PROVIDED the PTY flushes history on
//     every command (see ensurePtyHistoryFlush below). Without that flush the
//     PTY keeps history in memory and these checks see an empty/stale file.
//
// The E2B Sandbox class is imported lazily so this module never crashes at
// import time if the SDK or env isn't present (that was the old boot-crash
// failure mode). We import '@e2b/code-interpreter' if available, else 'e2b'.
// ---------------------------------------------------------------------------

let _SandboxClassPromise = null;

async function loadSandboxClass() {
  if (_SandboxClassPromise) return _SandboxClassPromise;
  _SandboxClassPromise = (async () => {
    // Prefer the code-interpreter package if the project uses it; fall back to
    // the base 'e2b' SDK. Both expose the same Sandbox.connect / commands.run.
    let mod;
    try {
      mod = await import("@e2b/code-interpreter");
    } catch {
      mod = await import("e2b");
    }
    // Named export in current SDKs; default export in some older builds.
    return mod.Sandbox || mod.default;
  })();
  return _SandboxClassPromise;
}

// The snippet to inject when you CREATE the PTY session, so that interactive
// history is flushed to ~/.bash_history after every command. Run this once,
// right after sandbox.pty.create(), by writing it into the PTY's stdin:
//
//   ptySession.sendStdin(ensurePtyHistoryFlush() + "\n")   // or your write fn
//
// It is idempotent and harmless to send more than once.
export function ensurePtyHistoryFlush() {
  // histappend: don't truncate the file; PROMPT_COMMAND: flush after each cmd.
  return "shopt -s histappend; export PROMPT_COMMAND='history -a'";
}

/**
 * Run a lesson's `check` inside the learner's E2B sandbox and report pass/fail.
 *
 * @param {string} sandboxId  The learner's running E2B sandbox id. Store this
 *                            when you create the PTY (sandbox.sandboxId) and
 *                            pass it in from the check route.
 * @param {object} lesson     A lesson object from LESSONS (needs check + pass).
 * @param {number} timeoutMs  Per-check timeout. Default 10s.
 * @returns {Promise<{passed: boolean, output: string}>}
 *
 * Return shape matches the old verifyInContainer, so existing callers keep
 * working — they just pass a sandboxId instead of a container name.
 */
export async function verifyInSandbox(sandboxId, lesson, timeoutMs = 10000) {
  if (!sandboxId) {
    return { passed: false, output: "no-sandbox-id" };
  }
  if (!lesson || !lesson.check) {
    return { passed: false, output: "no-check-defined" };
  }

  let Sandbox;
  try {
    Sandbox = await loadSandboxClass();
    if (!Sandbox) return { passed: false, output: "e2b-sdk-unavailable" };
  } catch {
    return { passed: false, output: "e2b-sdk-unavailable" };
  }

  let sandbox;
  try {
    // Reconnects to the existing sandbox; auto-resumes if it was paused.
    sandbox = await Sandbox.connect(sandboxId);
  } catch (err) {
    // Sandbox expired / killed / wrong id — treat as a clear, non-crashing state.
    return {
      passed: false,
      output: "sandbox-unreachable: " + (err?.message || String(err)),
    };
  }

  try {
    // Run the check in bash via login shell so ~ expands and PATH is sane.
    // We don't trust exit codes alone — the lesson signals success by echoing
    // its `pass` token (default "PASS"), exactly like the old Docker path.
    const result = await sandbox.commands.run(`bash -lc ${shellQuote(lesson.check)}`, {
      timeoutMs,
    });
    const out = ((result?.stdout || "") + (result?.stderr || "")).trim();
    const passed = out.includes(lesson.pass || "PASS");
    return { passed, output: out };
  } catch (err) {
    // A failing `check` can exit non-zero; some SDK versions throw on non-zero.
    // Inspect the error's captured output for the pass token before giving up.
    const captured =
      (err?.stdout || "") + (err?.stderr || "") + (err?.message || "");
    const passed = captured.includes(lesson.pass || "PASS");
    return { passed, output: captured.trim() || "check-failed" };
  }
}

// Minimal POSIX single-quote escaper so the whole `check` string is passed to
// `bash -lc` as ONE argument, with no shell-injection surprises.
function shellQuote(s) {
  return "'" + String(s).replace(/'/g, `'\\''`) + "'";
}

// ---------------------------------------------------------------------------
// Back-compat shim. The old export was verifyInContainer(containerName, ...).
// Callers that still import it keep working: the first arg is now treated as a
// sandboxId. Update call sites to verifyInSandbox when convenient.
// ---------------------------------------------------------------------------
export function verifyInContainer(sandboxIdOrContainer, lesson, timeoutMs = 10000) {
  return verifyInSandbox(sandboxIdOrContainer, lesson, timeoutMs);
}