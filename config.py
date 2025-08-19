# config.py
import os
from dotenv import load_dotenv
import assemblyai as aai
import logging

# Load environment variables from .env file
load_dotenv()

# Load API Keys from environment
MURF_API_KEY = os.getenv("MURF_API_KEY")
ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")

# Configure APIs and log warnings if keys are missing
if ASSEMBLYAI_API_KEY:
    aai.settings.api_key = ASSEMBLYAI_API_KEY
else:
    logging.warning("ASSEMBLYAI_API_KEY not found in .env file.")

if not PERPLEXITY_API_KEY:
    logging.warning("PERPLEXITY_API_KEY not found in .env file.")

if not MURF_API_KEY:
    logging.warning("MURF_API_KEY not found in .env file.")
