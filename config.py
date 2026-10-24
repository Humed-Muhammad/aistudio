"""Settings come from the shell first, then from this folder's .env (never from a parent folder).
Values from .env are copied into the environment so helper processes (tracking, rendering) see them too."""
import os
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def load_env():
    try:lines=(ROOT/'.env').read_text().splitlines()
    except OSError:return
    for raw in lines:
        line=raw.strip()
        if not line or line.startswith('#') or '=' not in line:continue
        key,value=line.split('=',1)
        os.environ.setdefault(key.strip(),value.strip().strip('"\''))

def setting(name,default=''):
    load_env()
    return os.environ.get(name,default)

def credential(name):
    value=setting(name)
    if not value:raise ValueError(f'Add {name} to the .env file in this folder.')
    return value
