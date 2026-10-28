# standfolk-agents: the Python story-agent service (port 8001, internal ingress only).
# Build from the repository root: docker build -f infra/agents.Dockerfile -t standfolk-agents .
# The model key arrives at run time as MODEL_API_KEY (a Container Apps secret); the image holds no secret.
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY services/agents/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/agents/src ./src
USER nobody
EXPOSE 8001
CMD ["python", "-m", "uvicorn", "standfolk_agents.app:create_default_app", "--factory", "--app-dir", "src", "--host", "0.0.0.0", "--port", "8001"]
