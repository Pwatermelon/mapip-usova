FROM python:3.12-slim
WORKDIR /app
COPY mapip-core/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY mapip-core/app ./app
RUN mkdir -p /app/data/ontology
COPY data/ontology/Ontology_Social_objects_new.rdf /app/data/ontology/
ENV PYTHONUNBUFFERED=1
ENV ONTOLOGY_PATH=/app/data/ontology/Ontology_Social_objects_new.rdf
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
