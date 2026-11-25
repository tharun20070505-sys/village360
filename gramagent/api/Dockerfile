FROM python:3.12-slim
WORKDIR /app
COPY gramagent/api/requirements.lock.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home --uid 10001 gramagent
COPY gramagent/api/gramagent /app/gramagent
RUN mkdir /app/.gramagent && chown -R gramagent:gramagent /app
USER gramagent
EXPOSE 8000
CMD ["uvicorn", "gramagent.main:app", "--host", "0.0.0.0", "--port", "8000"]
