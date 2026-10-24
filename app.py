"""Humed’s AI Studio: one local server for the Shorts editor, Motion graphics and the Audio cleaner."""
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from shorts_app import router as shorts_router
from cleaner_app import router as cleaner_router
from graphics_app import router as graphics_router

ROOT=Path(__file__).resolve().parent
RUNS=ROOT/'runs';RUNS.mkdir(exist_ok=True)
app=FastAPI(title='Humed’s AI Studio')
for router in (shorts_router,cleaner_router,graphics_router):app.include_router(router)

@app.get('/')
def home():return RedirectResponse('/shorts')

@app.get('/health')
def health():return {'status':'ok','service':'Humed’s AI Studio'}

app.mount('/runs',StaticFiles(directory=RUNS),name='runs')
app.mount('/static',StaticFiles(directory=ROOT/'static'),name='static')
