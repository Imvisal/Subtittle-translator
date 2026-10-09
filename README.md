# 🇱🇰 SubLanka AI — Subtitle Translator

**Translate English movie and TV subtitles into Sinhala with AI.**

SubLanka AI is a web-based subtitle translation project designed to help users search for subtitles, upload SRT files, and translate English subtitle dialogue into natural Sinhala using Google Gemini AI.

🌐 **Live Website:** https://subtitle-translator.vercel.app/

---

## ✨ Features

- 🎬 **Movie & TV Search** — Search for movies and TV series.
- 🔥 **Trending Categories** — Browse available Trending, Movies, TV Series, and Anime categories.
- 🔎 **Subtitle Search** — Search for English subtitles for selected titles.
- 🇱🇰 **Sinhala Subtitle Lookup** — Check configured sources for existing Sinhala subtitles.
- 📂 **SRT File Upload** — Upload your own `.srt` subtitle file.
- 🤖 **AI Translation** — Translate English subtitle dialogue into Sinhala using Google Gemini.
- 📺 **TV Episode Selection** — Select a season and episode when searching for TV subtitles.
- 📊 **Translation Progress** — Display translation progress and percentage while processing subtitle batches.
- ⬇️ **SRT Download** — Download translated subtitles for use with compatible video players.
- 🌙 **Modern Dark UI** — A responsive interface with a dark theme and visual effects.

*Features depend on the current deployment, API configuration, and availability of external services.*

## 🛠️ Built With

- HTML5
- CSS3
- JavaScript
- Node.js serverless API routes
- Google Gemini API
- Vercel

External movie and subtitle search integrations may include OMDb, TMDB, SubDL, and configured Sinhala subtitle sources.

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Imvisal/Subtittle-translator.git
```

### 2. Open the project

```bash
cd Subtittle-translator
```

### 3. Configure environment variables

Create a `.env` file locally, or configure environment variables in your Vercel project settings.

```env
GEMINI_API_KEY=your_gemini_api_key
OMDB_API_KEY=your_omdb_api_key
SUBDL_API_KEY=your_subdl_api_key
TMDB_API_KEY=your_tmdb_api_key
```

Use only the variables required by the API routes in your project. The variable names above must match the names used in your server-side code.

**Security:** Never put secret API keys directly in frontend JavaScript, commit them to GitHub, or expose them to visitors.

### 4. Run locally

Install the Vercel CLI if your project uses Vercel serverless functions.

```bash
npm install -g vercel
vercel dev
```

Open the local URL displayed in the terminal.

### 5. Deploy with Vercel

1. Push your project to GitHub.
2. Import the repository into Vercel.
3. Add the required API keys under **Project Settings → Environment Variables**.
4. Deploy the project.
5. Test subtitle search, SRT upload, translation, and downloads.

## 📁 Project Structure

The project may use a structure similar to the following:

```text
Subtittle-translator/
├── api/
│   ├── search.js
│   ├── subtitles.js
│   ├── translate.js
│   ├── subtitle-download.js
│   └── sinhala-search.js
├── index.html
├── script.js
├── style.css
├── README.md
└── .gitignore
```

*The API filenames shown here are examples based on the project's current functionality. Keep the actual filenames in your repository.*

## 🔐 Privacy & Security

- Subtitle text submitted for AI translation may be sent to Google Gemini through the server-side translation API.
- External search providers may receive the movie titles or search terms needed to retrieve results.
- Do not upload confidential or sensitive material unless you understand how it will be processed.
- Keep API keys on the server and out of public source code.

Read the website's [Privacy Policy](https://subtitle-translator.vercel.app/privacy.html) and [Terms of Service](https://subtitle-translator.vercel.app/terms.html).

## ⚠️ Important Notes

- AI translations may contain errors and should be reviewed before use.
- Translation requests may fail due to API quotas, rate limits, or service outages.
- Subtitle availability depends on external providers.
- Users are responsible for ensuring they have the necessary rights or permission to use subtitle content.

## 🎯 Project Goal

The goal of SubLanka AI is to make Sinhala subtitles more accessible by providing an easy-to-use platform for subtitle search, AI translation, and SRT file processing.

## 👨‍💻 Author

**Visal Udyogi**

Built with ❤️ for Sinhala subtitle users in Sri Lanka.

---

⭐ If you find this project useful, consider giving the repository a star on GitHub.
