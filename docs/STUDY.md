# Study and personal Ollama

From **Menu → Study**, the bookshelf, the «Review cards» furniture or the study stations, a
full-screen cover opens with three illustrated cards:

- **Notebooks**: opens your notebooks. The dashed cover with a + creates another one.
  Inside, pages and the block, Markdown and formula editor are kept.
- **Flashcards**: choose Review or Create. Each card has a question and an answer;
  hints, tags and difficulty are optional. Progress is saved locally.
- **Quiz**: choose Play or Create. Add questions with 2–4 different answers and
  mark one as correct. You can practise alone, offline, or open a contest.

Inside a room of a house, Study opens that room's own notebooks, flashcards and quizzes;
the village and the lobby share the general ones.

In a village contest, the host selects a quiz and starts the game when
there is at least one other person. The host also answers. Guests can
join even if their library is empty. Solutions do not appear until everyone
has answered or time runs out; the host calculates the score.
The time limit is configurable. The host can end the contest for everyone.

Old cards marked «Use in contests» are kept as flashcards and their
questions are copied once into the quiz library. Deleting a migrated quiz
does not make it come back. The migration is only recorded after saving.

## Setting up Ollama

In the Library, walk to the **Set up Ollama** furniture. The guide lets you:

1. Open the official installation instructions for your system.
2. Check Ollama on your own computer, at `127.0.0.1:11434`.
3. Choose one of the local models that are actually installed.
4. Test and turn on each feature, or use Set up everything.

There is a shared model plus exceptions for flashcards, quizzes, the whiteboard assistant,
visual conversion to LaTeX, sprites and Gartic bots. Visual features require
a vision model; the tests check that the model returns valid results
for that specific feature. If one feature fails, the others can stay on.

Each person sets up their own AI, guests included. Gartic bots
run on the host's computer. Ollama settings are not published to the village.
The app does not install software, download models or run commands.

Without a verified setup, the AI shortcuts do not appear in Study, the
whiteboard or Gartic. The furniture's guide is still available. After setup,
the app checks the models again each time it opens. A changed or removed model
needs another test. Generation shows a draft to review before
adding it to a deck or quiz. Gemini and canned answers are no longer used.

If the browser blocks the connection, the guide shows the exact origin to allow in
`OLLAMA_ORIGINS` and links to the official instructions. There is no need to expose
Ollama to other computers. Documentation: https://docs.ollama.com/faq

## Whiteboard and settings

The whiteboard fills the available space without scrolling the page. Use Hand to
move around the canvas, the wheel to scroll and Ctrl + wheel to zoom. Advanced
options overlay the canvas and scroll on their own when needed.
Manual formulas are always available; AI depends on its setup.

Settings is split into Profile, Ambience, Controls and Identity. Ambience includes cards
for light and weather, separate sound, volume and particle options. All
scrolling areas share a wood-and-paper scrollbar.

Errors are shown in the chosen language, with hints next to the fields or accessible
notices. Validation JSON, stack traces and internal messages are never shown.
