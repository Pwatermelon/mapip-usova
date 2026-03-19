from flask import Blueprint, request, jsonify
import pandas as pd
from sqlalchemy import text, create_engine
from surprise import Dataset, Reader, SVD
import logging
import os
import pickle

# Подключение к базе данных
# docker-compose хост PostgreSQL называется `db`, поэтому дефолт тоже должен быть `db`.
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:12345@db:5432/map')
engine = create_engine(DATABASE_URL)

recommendations_bp = Blueprint('recommendations', __name__)

# Инициализация глобальной переменной для модели
model_of_rec = None

def train_model():
    """Функция для обучения модели и ее сохранения."""
    global model_of_rec
    try:
        sql_query = """
        SELECT DISTINCT u."Id" AS user_id, 
                mo."Id" AS item_id, 
                COALESCE(c."Rate", 0) AS rating
        FROM public."User" u
        JOIN public."Route" r ON u."Id" = r."UserId"
        JOIN public."RouteMapObject" rmo ON r."Id" = rmo."RouteId"
        JOIN public."MapObject" mo ON rmo."ListObjectsId" = mo."Id"
        LEFT JOIN public."Comment" c ON mo."Id" = c."MapObjectId" AND u."Id" = c."UserId";
        """

        with engine.connect() as connection:
            result = connection.execute(text(sql_query))
            data = pd.DataFrame(result.fetchall(), columns=result.keys())
        
        data.rename(columns={'user_id': 'UserId', 'item_id': 'ItemId', 'rating': 'Rating'}, inplace=True)
        
        reader = Reader(rating_scale=(0, 5))
        dataset = Dataset.load_from_df(data[['UserId', 'ItemId', 'Rating']], reader)
        trainset = dataset.build_full_trainset()
        
        model_of_rec = SVD()
        model_of_rec.fit(trainset)

        # Сохраняем модель в файл
        with open('model.pkl', 'wb') as f:
            pickle.dump(model_of_rec, f)

        logging.info("The model has been successfully trained and saved.")
    
    except Exception as e:
        logging.error("Error during model training: %s", str(e), exc_info=True)

# Предоставление рекомендаций по всем пользователям
@recommendations_bp.route('/recommend_all', methods=['GET'])
def recommend_all():
    """Генерирует рекомендации для всех пользователей, перед этим обучая модель."""
    global model_of_rec

    # Обучаем модель перед генерацией рекомендаций
    train_model()
    
    try:
        with engine.connect() as connection:
            users = [row[0] for row in connection.execute(text('SELECT DISTINCT "Id" FROM public."User"')).fetchall()]
            items = [row[0] for row in connection.execute(text('SELECT DISTINCT "Id" FROM public."MapObject"')).fetchall()]
        
        recommendations = {}
        for user_id in users:
            predictions = [model_of_rec.predict(user_id, item) for item in items]
            threshold = 3.5
            filtered_predictions = [rec for rec in predictions if rec.est > threshold]
            
            if filtered_predictions:
                sorted_predictions = sorted(filtered_predictions, key=lambda x: x.est, reverse=True)
                recommended_items = [rec.iid for rec in sorted_predictions[:40]] 
                recommendations[user_id] = recommended_items
        logging.info(f"Recommendations were successfully generated for {len(recommendations)} users")
            
        return jsonify(recommendations)
    
    except Exception as e:
        logging.error("Error during recommendation generation: %s", str(e), exc_info=True)
        return jsonify({'error': 'Internal Server Error'}), 500


