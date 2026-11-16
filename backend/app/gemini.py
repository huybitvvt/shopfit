"""Reuse a synchronous Gemini connection per calling thread, with explicit cleanup."""
import threading


class GeminiClients:
    def __init__(self, settings, timeout_ms):
        self.settings, self.timeout_ms = settings, timeout_ms
        self.local = threading.local()
        self.clients = []
        self.lock = threading.Lock()

    def get(self):
        if not hasattr(self.local, "client"):
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=self.settings.gemini_api_key,
                http_options=types.HttpOptions(timeout=self.timeout_ms, retry_options=types.HttpRetryOptions(attempts=1)))
            self.local.client = client
            with self.lock:
                self.clients.append(client)
        return self.local.client

    def close(self):
        with self.lock:
            clients, self.clients = self.clients, []
        for client in clients:
            client.close()
