from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

# Import modular routers
from api.images import router as images_router
from api.storyboards import router as storyboards_router
from api.audio import router as audio_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Akaza Backend",
    version="1.0.0",
    description="Professional AI-powered storyboarding application",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Include modular routers
app.include_router(images_router)
app.include_router(storyboards_router)
app.include_router(audio_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Akaza Backend API", "version": "1.0.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8009)