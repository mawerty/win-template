"""
Simple logging utility for tracking async operations.
"""

import time
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime


class StepLogger:
    """Logger for tracking steps in async operations."""
    
    def __init__(self, operation_name: str):
        self.operation_name = operation_name
        self.start_time = time.time()
        self.step_count = 0
        print(f"\n{'='*60}")
        print(f"🚀 START: {operation_name}")
        print(f"   Czas: {datetime.now().strftime('%H:%M:%S')}")
        print(f"{'='*60}")
    
    def step(self, message: str):
        """Log a step."""
        self.step_count += 1
        elapsed = time.time() - self.start_time
        print(f"   [{self.step_count}] {message} (⏱️ {elapsed:.2f}s)")
    
    def substep(self, message: str):
        """Log a substep."""
        elapsed = time.time() - self.start_time
        print(f"       → {message} (⏱️ {elapsed:.2f}s)")
    
    def warning(self, message: str):
        """Log a warning."""
        print(f"   ⚠️  {message}")
    
    def error(self, message: str):
        """Log an error."""
        print(f"   ❌ {message}")
    
    def success(self, message: str):
        """Log success."""
        print(f"   ✅ {message}")
    
    def finish(self, result_summary: str = ""):
        """Finish logging."""
        total_time = time.time() - self.start_time
        print(f"{'='*60}")
        print(f"✅ DONE: {self.operation_name}")
        if result_summary:
            print(f"   Wynik: {result_summary}")
        print(f"   Całkowity czas: {total_time:.2f}s")
        print(f"   Kroków: {self.step_count}")
        print(f"{'='*60}\n")


@asynccontextmanager
async def timed_step(logger: StepLogger, step_name: str):
    """Context manager for timing async steps."""
    start = time.time()
    logger.step(f"Rozpoczynam: {step_name}...")
    try:
        yield
        elapsed = time.time() - start
        logger.substep(f"Zakończono: {step_name} ({elapsed:.2f}s)")
    except Exception as e:
        elapsed = time.time() - start
        logger.error(f"Błąd w {step_name}: {str(e)[:100]} ({elapsed:.2f}s)")
        raise

