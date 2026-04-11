# AI Detect Essay Review

A public web application that analyzes essay documents (`.docx`, `.doc`) for AI-generated content risk. It provides a detailed review with highlighted passages and constructive coaching to help writers maintain authenticity and academic integrity.

## Core Features

- **Document Analysis**: Supports `.docx` and legacy `.doc` files (up to 5 MB).
- **Risk Assessment**: Uses sentence-level detection to identify high-risk AI-like phrasing.
- **Constructive Coaching**: Provides specific suggestions for improvement without helping to evade detectors.
- **Rewritten Suggestions**: On-demand full-sentence rewrites for any highlighted span; requires both `SAPLING_API_KEY` and `COACHING_LLM_API_KEY`.
- **Privacy First**: All uploaded documents and analysis artifacts are deleted immediately after processing.

## Getting Started

### Prerequisites

- Node.js 20 or later
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd ai-detector
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Copy `.env.example` to `.env.local` and add your Sapling API key.
   ```bash
   cp .env.example .env.local
   ```

### Development

Run the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

### Testing

Run the full verification suite:
```bash
npm run lint      # Linting
npm run typecheck # TypeScript checks
npm run test      # Unit and integration tests
npm run test:e2e  # Playwright end-to-end tests
```

## Deployment

This application is designed for the Vercel Node.js runtime.

1. API keys are configured through the in-app **Settings** modal. No server-side environment variables are required for API key configuration.

2. Ensure the project is configured for the App Router and Node.js runtime (set to `nodejs` in relevant routes).

## Policy & Limits

- **Language Support**: English only.
- **File Types**: `.docx`, `.doc`.
- **Text Limits**: Analysis requires a minimum of 300 characters and supports up to 100,000 characters.
- **Retention**: We do not persist any essay text, metadata, or analysis results beyond the duration of the request.
- **Accuracy**: Detection is a statistical risk assessment. It is not a definitive claim of cheating or origin.
