from flask import Flask
import os
import logging
from sqlalchemy import create_engine
from comments import comments_bp
from recommendations import recommendations_bp

app = Flask(__name__)

# Настройка логирования
logging.basicConfig(filename='app.log', level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

# Подключение к базе данных
# В docker-compose хост PostgreSQL называется `db`, поэтому дефолт тоже должен быть `db`.
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:12345@db:5432/map')
engine = create_engine(DATABASE_URL)

# Регистрация маршрутов
app.register_blueprint(comments_bp, url_prefix='/comments')
app.register_blueprint(recommendations_bp, url_prefix='/recommendations')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)