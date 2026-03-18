from flask import Blueprint, request, jsonify
import logging
import re
import spacy
import pickle
import pymorphy2

comments_bp = Blueprint('comments', __name__)

morph = pymorphy2.MorphAnalyzer()

# Функция для чтения данных из файла
def read_data(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        return [line.strip() for line in file]

# Функция для создания словаря замен на основе данных
def create_dict(input_lines, output_lines):
    word_dict = {}
    for input_line, output_line in zip(input_lines, output_lines):
        input_word = input_line.split(' - ')[0].strip()
        output_word = output_line.split(' - ')[1].strip()
        word_dict[input_word] = output_word
    return word_dict

# Функция для лемматизации текста
def lemmatize_word(word):
    parsed_word = morph.parse(word)[0]  
    return parsed_word.normal_form

# Функция для нормализации текста
def normalize_text(text):
    text = ' '.join(text.split())
    substitution_dict = {
        'а': ['а', 'a', '@'], 'б': ['б', '6', 'b'], 'в': ['в', 'b', 'v'],
        'г': ['г', 'r', 'g'], 'д': ['д', 'd'], 'е': ['е', 'e', '3'], 'ё': ['ё', 'e'],
        'ж': ['ж', 'zh', '*'], 'з': ['з', '3', 'z'], 'и': ['и', 'u', 'i'],
        'й': ['й', 'u', 'i'], 'к': ['к', 'k', 'i{', '|{'], 'л': ['л', 'l', 'ji'],
        'м': ['м', 'm'], 'н': ['н', 'h', 'n'], 'о': ['о', 'o', '0'],
        'п': ['п', 'n', 'p'], 'р': ['р', 'r', 'p'], 'с': ['с', 'c', 's'],
        'т': ['т', 'm', 't'], 'у': ['у', 'y', 'u'], 'ф': ['ф', 'f'],
        'х': ['х', 'x', 'h', '}{'], 'ц': ['ц', 'c', 'u,'], 'ч': ['ч', 'ch'],
        'ш': ['ш', 'sh'], 'щ': ['щ', 'sch'], 'ь': ['ь', 'b'], 'ы': ['ы', 'bi'],
        'ъ': ['ъ'], 'э': ['э', 'e'], 'ю': ['ю', 'io'], 'я': ['я', 'ya']
    }
    for key, values in substitution_dict.items():
        for value in values:
            text = text.replace(value, key)
    return text

# Функция для удаления повторяющихся символов в слове
def remove_repeated_chars(word):
    return ''.join([char for i, char in enumerate(word) if (i == 0 or char != word[i - 1])])

# Функция для цензуры текста
def censor_text(text, bad_words_dict):
    wasModified = False
    normalized_text = normalize_text(text)
    tokens = re.findall(r'\w+|[^\w\s]', normalized_text, re.UNICODE)
    
    censored_tokens = []

    for token in tokens:
        if re.match(r'\w+', token):
            found = False
            cleaned_word = remove_repeated_chars(token.lower())
            lemma_word = lemmatize_word(cleaned_word)  
            parsed_token = morph.parse(cleaned_word)[0]  
            
            for bad_word, replacement in bad_words_dict.items():
                cleaned_bad_word = remove_repeated_chars(bad_word.lower())
                if lemma_word == cleaned_bad_word:  
                    
                    replacement_words = replacement.split()
                    wasModified = True
                    
                    for replacement_word in replacement_words:
                        parsed_replacement = morph.parse(replacement_word)[0]
                        inflected_replacement = parsed_replacement.inflect(parsed_token.tag.grammemes)
                        print(inflected_replacement)
                        censored_tokens.append(inflected_replacement.word if inflected_replacement else replacement_word)
                    
                    found = True
                    break

            if not found:
                censored_tokens.append(token)
        else:
            censored_tokens.append(token)
    
    return ' '.join(censored_tokens)

def word_processing(text, censored_words):
    words = re.findall(r'\b[\w*]+\b', text)
    was_modified = False 
    
    def is_censored_match(word, censored):
        cleaned_word = word.lower()
        censored = censored.lower()
        print(cleaned_word, censored)
        if len(cleaned_word) != len(censored):
            return False
        return all(cw == lw or lw == '*' for cw, lw in zip(censored, cleaned_word))
    
    for word in words:
        for censored, replacement in censored_words.items():
            if '*' in word and is_censored_match(word, censored):
                text = text.replace(word, replacement)
                was_modified = True 
    
    return text


def normalize_word(word):
    pattern = re.escape(word)
    pattern = re.sub(r'(.)', r'\1[ *]*', pattern)
    return pattern

# def replace_words(text, word_dict):
#     for word, replacement in word_dict.items():
#         pattern = normalize_word(word)
#         regex = re.compile(pattern, re.IGNORECASE)
#         text = regex.sub(replacement+' ', text)
#     return text

@comments_bp.route('/replace_comment', methods=['POST'])
def replace_comment():
    data = request.json
    wasModified = False
    comment = data.get('comment', '')

    censored_comment = word_processing(comment, bad_words_dict)
    censored_comment = censor_text(censored_comment, bad_words_dict)
    censored_comment = comment
    if (comment != censored_comment):
        wasModified = False
    else:
        wasModified = False
    
    return jsonify({
        'message': censored_comment,
        'new_comment': censored_comment,
        'wasModified': wasModified
    })

# Лемматизация текста
def lemmatize_text_spacy(text):
    doc = nlp(text)
    return ' '.join([token.lemma_ for token in doc if not token.is_stop and not token.is_punct])

# Функция для проверки на оскорбительный комментарий
def check_if_offensive(text):
    lemmatized_text = lemmatize_text_spacy(text)  
    lemmatized_text = ' '.join([remove_repeated_chars(word) for word in lemmatized_text.split()])
    
    text_tfidf = vectorizer.transform([lemmatized_text])  
    predicted_class = model_of_com.predict(text_tfidf)  

    return predicted_class[0] == "Отрицательный"

@comments_bp.route('/check_comments', methods=['POST'])
def check_comments():
    comments = request.get_json(force=True)
    offensive_comments = []

    for comment in comments:
        text = comment['text']
        if check_if_offensive(text):
            offensive_comments.append(comment)

    return jsonify(offensive_comments)

# Загрузка модели обработки естественного языка для русского языка
nlp = spacy.load('ru_core_news_sm')

# Загрузка модели для извлечения оскорбительных комментариев
with open('model_of_comment.pkl', 'rb') as f:
    model_of_com = pickle.load(f)

# Загрузка векторизатора для извлечения оскорбительных комментариев
with open('vectorizer.pkl', 'rb') as f:
    vectorizer = pickle.load(f)

# Создание словаря для фильтрации нежелательных слов
input_lines = read_data('ru_in.txt')
output_lines = read_data('ru_in.txt')
bad_words_dict = create_dict(input_lines, output_lines)
