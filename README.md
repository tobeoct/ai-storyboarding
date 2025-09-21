# Akaza - AI Storyboard Application

A professional AI-powered storyboarding application built with FastAPI backend and vanilla JavaScript frontend.

## Architecture

- **Backend**: Python FastAPI with Google Gemini AI integration
- **Frontend**: HTML/CSS/JavaScript with Nginx
- **Deployment**: Docker Compose

## Features

- AI-powered image generation for storyboards
- Multiple storyboard templates (Explainer, Social Media, Music Video)
- Text-to-speech audio generation
- Style reference system
- Project asset library
- PDF and XML export
- Story analysis and suggestions
- Animatic preview

## Quick Start with Docker

1. **Clone and setup environment**:
   ```bash
   git clone <repository-url>
   cd Storyboard
   cp .env.example .env
   ```

2. **Add your Google Gemini API key to `.env`**:
   ```bash
   GEMINI_API_KEY=your_actual_api_key_here
   ```

3. **Run with Docker Compose**:
   ```bash
   docker-compose up --build
   ```

4. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8009
   - API Documentation: http://localhost:8009/docs

## Manual Setup (Development)

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Add your GEMINI_API_KEY to .env
uvicorn app:app --reload
```

### Frontend Setup

```bash
cd frontend
# Serve with any HTTP server:
python -m http.server 8080
# Or use Live Server in VS Code
```

## API Endpoints

- `POST /api/generate-image` - Generate storyboard images
- `POST /api/generate-style` - Generate style references
- `POST /api/generate-audio` - Text-to-speech generation
- `POST /api/generate-storyboard` - Generate complete storyboards
- `POST /api/generate-suggestions` - Get shot suggestions
- `POST /api/analyze-story` - Analyze story structure

## Environment Variables

- `GEMINI_API_KEY` - Your Google Gemini API key (required)

## Project Structure

```
├── backend/
│   ├── app.py              # FastAPI application
│   ├── requirements.txt    # Python dependencies
│   └── Dockerfile         # Backend container
├── frontend/
│   ├── index.html         # Main HTML file
│   ├── app.js            # JavaScript application
│   ├── styles.css        # CSS styles
│   ├── nginx.conf        # Nginx configuration
│   └── Dockerfile        # Frontend container
├── docker-compose.yml     # Multi-container setup
└── README.md             # This file
```

## Usage

1. **Import Script**: Upload your script or use AI templates
2. **Generate Images**: Use AI to create storyboard panels
3. **Customize**: Adjust cinematography, lighting, and composition
4. **Export**: Download as PDF or XML for video editing software
5. **Preview**: Use the animatic player to preview your storyboard

## Development

For development with live reload:

```bash
# Backend (with auto-reload)
cd backend
uvicorn app:app --reload --host 0.0.0.0 --port 8009

# Frontend (with live server)
cd frontend
# Use VS Code Live Server or similar
```

## Docker Commands

```bash
# Build and start services
docker-compose up --build

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild specific service
docker-compose build backend
docker-compose build frontend
```

## Requirements

- Docker and Docker Compose
- Google Gemini API key

## License

MIT License