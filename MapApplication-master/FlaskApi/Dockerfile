FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    cython3 \
    && apt-get clean

COPY . /app

RUN /usr/local/bin/python3.10 -m venv /app/venv
RUN /app/venv/bin/pip install --upgrade pip
# ru_core_news_sm ставится из requirements.txt (прямой URL на wheel), без отдельного spacy download
RUN /app/venv/bin/pip install --no-cache-dir -r requirements.txt

EXPOSE 5001

CMD ["/app/venv/bin/python", "app2.py"]

