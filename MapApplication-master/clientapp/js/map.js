const apiUrl = '/GetSocialMapObject';
let recommendationsArray = []; 
const map = L.map('map').setView([51.533557, 46.034257], 15);

var flag;

const markersMap = new Map();
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
}).addTo(map);

fetch(apiUrl)
  .then(response => {
    if (!response.ok) {
      throw new Error(`Ошибка HTTP: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    objects = data;
    
    data.forEach(obj => {
      delete obj.$id;
      
      const marker = L.circleMarker([obj.x, obj.y], {
        radius: 10, 
        color: '#3388ff',
        fillColor: '#3388ff',
        fillOpacity: 0.5,
      }).addTo(map);

      markersMap.set(obj.id, marker);
      
      marker.on('click', async () => {
        const isFavorite = await checkIfFavorite(obj.id, userId);
        const heartClass = isFavorite ? 'heart-filled' : 'heart-outline';
        const popupContent = `
          <div class="popup-content">
            <div class="comment-header">
                <div class="comment-rating" id="rate-${obj.id}">
                    ${generateStars(obj.id, obj.rating)}
                </div>
            </div>
            <span class="heart-icon ${heartClass}" onclick="toggleFavorite(${obj.id}, ${userId}, this)"></span>
            <strong>${obj.display_name}</strong><br>
            ${obj.type}<br>
            <div class="buttons"><button onclick="showDetails(${obj.id})">Подробнее</button></div>
          </div>
        `;
        marker.bindPopup(popupContent).openPopup();
      });
    });
  })
  .catch(error => {
    console.error('Ошибка загрузки данных из API:', error);
  });

document.addEventListener("DOMContentLoaded", () => {
  const leafletBottomRight = document.querySelector('.leaflet-bottom.leaflet-right');
  if (leafletBottomRight) leafletBottomRight.remove();
});

// Поиск объектов по названию и адресу
document.getElementById("load-comments-of-search").addEventListener("click", async function (event) {
    event.preventDefault();

    const query = document.getElementById("search").value.trim();
    const resultsContainer = document.getElementById("search-results");  
    if (!query) {
        resultsContainer.innerHTML = "<p>Введите текст для поиска.</p>";
        return;
    }
  
    try {
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(`/api/SocialMapObject/SearchBy/?search=${encodedQuery}`);
        if (!response.ok) {
            throw new Error("Ошибка при получении данных.");
        }
        
        const data = await response.json();
        if (data.length === 0) {
            resultsContainer.innerHTML = "<p>Объекты не найдены.</p>";
            return;
        }
  
        resultsContainer.innerHTML = data
            .map(obj => ` <div class="comment" onclick="focusOnMap(${obj.id})">
                            <h3>${obj.display_name}</h3>
                            <p>${obj.adress}</p>
                         </div>`)
            .join("");
    } 
    
    catch (error) {
        console.error(error);
        resultsContainer.innerHTML = "<p>Произошла ошибка. Попробуйте позже.</p>";
    }
});

// Загрузка комментариев по объекту
document.addEventListener('click', event => {
    if (event.target.classList.contains('show-comments-button')) {
        const button = event.target;
        const idObj = button.getAttribute('data-id');
        const container = document.getElementById('comments-container');
        const containerComment = document.getElementById('commentForm');
        containerComment.innerHTML = '';
        if (button.innerText === 'Показать комментарии') {
            axios.get(`/api/comment/GetCommentsByMapObject/${idObj}`)
                .then(response => {
                    container.innerHTML = '';
                    const comments = response.data;
                    console.log(comments);
                    if (comments.length === 0) {
                        container.innerHTML = "<p>Комментариев пока нет...</p>";
                        return;
                    }

                    comments.forEach(comment => {
                        container.innerHTML += `
                            <div class="comment" id="comment-${comment.id}">
                                <div class="comment-header">
                                    <p class="comment-date">Дата добавления: ${formatDate(comment.date)}</p>
                                    <p class="comment-user"><strong>${comment.user.name}</strong></p>
                                    <div class="comment-rating" id="rate-${comment.id}">
                                        ${generateStars(comment.id, comment.rate)}
                                    </div>
                                </div>
                                <label for="text-${comment.id}">Текст:</label>
                                <p>${comment.text}</p>
                            </div>
                        `;
                    });

                    button.innerText = 'Скрыть комментарии';
                })
                .catch(error => {
                    console.error(error);
                });
        } else {
            container.innerHTML = '';
            button.innerText = 'Показать комментарии';
        }
    }
});

// Написать комментарий
document.addEventListener('click', event => {
    if (event.target.classList.contains('write-comments-button')) {
        const button = event.target;
        const idObj = button.getAttribute('data-id');
        const container = document.getElementById('commentForm');
        const containerComments = document.getElementById('comments-container');
        containerComments.innerHTML = '';
        const uniqueId = `new-${Date.now()}`; 
        const button2 = document.querySelector('.show-comments-button');
        console.log(button2);
        const buttonText = button2.innerText;
        console.log(buttonText);
            if (buttonText === 'Скрыть комментарии') {

                button2.innerText = 'Показать комментарии';
                console.log('Показать комментарии');
            
            } 
        else {
            console.log('Кнопка не найдена');
        }
        const newCommentHTML = `
        <div class="comment" id="comment-${uniqueId}">
            <div class="comment-header">
                <div class="comment-rating" id="rate-${uniqueId}">
                    ${generateStars(uniqueId, 0)} <!-- Генерация пустых звезд -->
                </div>
            </div>
            <label for="text-${uniqueId}">Текст:</label>
            <textarea id="text-${uniqueId}" placeholder="Введите ваш комментарий..."></textarea>
            <input type="hidden" id="rate-hidden-${uniqueId}" value="0">
            <button class="submitNewComment" data-unique-id="${uniqueId}" data-id="${idObj}">Отправить</button>
        </div>
        `;

        container.insertAdjacentHTML('beforeend', newCommentHTML);

        const newCommentContainer = document.getElementById(`comment-${uniqueId}`);
        initializeStarRatingEvents(newCommentContainer);
    }

    if (event.target.classList.contains('submitNewComment')) {
        event.preventDefault();

        const button = event.target;
        const uniqueId = button.getAttribute('data-unique-id');
        const mapObjectId = button.getAttribute('data-id');

        const commentText = document.getElementById(`text-${uniqueId}`).value;
        const rate = document.getElementById(`rate-hidden-${uniqueId}`).value;

        if (!commentText || !rate) {
            alert('Пожалуйста, заполните текст комментария и выберите рейтинг!');
            return;
        }

        const data = {
            text: commentText,
            rate: rate,
            userId: userId,
            mapObjectId: mapObjectId
        };

        sendComment(data, uniqueId);
    }
});

// Подгрузка элементов доступной среды из онтологии 
document.addEventListener("DOMContentLoaded", function() {
    fetch('/api/SocialMapObject/get/accessibility')
        .then(response => response.json())
        .then(data => {

            const items = Array.isArray(data) ? data : data;
            
            if (Array.isArray(items)) {
                const container = document.getElementById('accessibilityContainer');
                items.forEach(item => {
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.name = 'accessibility';
                    item_ = item.replace(/ /g, '_');
                    checkbox.value = '<http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#' + item_ + '>';
                    
                    const label = document.createElement('label');
                    
                    label.textContent = item;
                    label.prepend(checkbox);
                    
                    container.appendChild(label);
                    container.appendChild(document.createElement('br'));
                });
            } else {
                console.error("Получен не массив данных для элементов доступной среды:", data);
            }
        })
        .catch(error => console.error("Ошибка при загрузке элементов доступной среды:", error));
});

// Функция, осуществляющая переход на карте по клику
async function focusOnMap(objectId) {
    const marker = markersMap.get(Number(objectId)); 
    const foundObject = objects.find(obj => obj.id === objectId);

    if (!foundObject || !marker) {
        console.error('Объект или маркер не найден:', objectId);
        return;
    }

    const { lat, lng } = marker.getLatLng(); 
    map.setView([lat, lng], 19); 

    if (!marker.getPopup()) {
        let popupContent = `
            <div class="popup-content">
                <div class="comment-header">
                    <div class="comment-rating" id="rate-${foundObject.id}">
                        ${generateStars(foundObject.id, foundObject.rating)}
                    </div>
                </div>`;

        if (typeof userId !== 'undefined' && userId !== null) {
            try {
                const isFavorite = await checkIfFavorite(foundObject.id, userId); 
                const heartClass = isFavorite ? 'heart-filled' : 'heart-outline';
                popupContent += `
                    <span class="heart-icon ${heartClass}" onclick="toggleFavorite(${foundObject.id}, ${userId}, this)"></span>`;
            } catch (error) {
                console.error('Ошибка при проверке статуса фаворита:', error);
            }
        }

        popupContent += `
                <h3>${foundObject.display_name}</h3>
                <p>${foundObject.adress}</p>
                <div class="buttons"><button onclick="showDetails(${objectId})">Подробнее</button></div>
            </div>`;

        marker.bindPopup(popupContent);
    }

    try {
        marker.openPopup();
    } catch (error) {
        console.error('Ошибка при открытии окна:', error);
    }
}


// Функция для генерации звезд
function generateStars(commentId, currentRating) {
    let starsHTML = '';
    for (let i = 1; i <= 5; i++) {
        const activeClass = i <= currentRating ? 'active-star' : ''; // Добавляем класс для закрашивания
        starsHTML += `
            <span class="star ${activeClass}" data-rating="${i}" data-comment-id="${commentId}">
                ★
            </span>
        `;
    }
    return starsHTML;
}

// Обработчики событий для рейтинга
function initializeStarRatingEvents(container) {
    container.querySelectorAll('.star').forEach(star => {
        
        star.addEventListener('click', function () {
            const rating = parseInt(this.getAttribute('data-rating'));
            const commentId = this.getAttribute('data-comment-id');
            setRating(commentId, rating);
        });

        star.addEventListener('mouseover', function () {
            const rating = parseInt(this.getAttribute('data-rating'));
            const commentId = this.getAttribute('data-comment-id');
            highlightStars(commentId, rating);
        });

        star.addEventListener('mouseout', function () {
            const commentId = this.getAttribute('data-comment-id');
            const savedRating = parseInt(document.getElementById(`rate-hidden-${commentId}`).value) || 0;
            highlightStars(commentId, savedRating);
        });
    });
}

// Установка рейтинга
function setRating(commentId, rating) {
    const hiddenInput = document.getElementById(`rate-hidden-${commentId}`);
    hiddenInput.value = rating;
    highlightStars(commentId, rating);
}

// Функция для подсветки звезд
function highlightStars(commentId, rating) {
    document.querySelectorAll(`#rate-${commentId} .star`).forEach(star => {
        const starRating = parseInt(star.getAttribute('data-rating'));
        star.style.color = starRating <= rating ? '#f0c808' : '#ccc'; 
    });
}

// Проверка объекта находится ли он в Избранном
async function checkIfFavorite(mapObjectId, userId) {
    try {
        const response = await fetch(`/api/users/GetLikesByUserId/${userId}`);
        if (!response.ok) return false;

        const favorites = await response.json();
        return favorites.some(obj => obj.id === mapObjectId);
    } catch (error) {
        console.error('Ошибка при проверке статуса фаворита:', error);
        return false;
    }
}

// Переключатель лайка
async function toggleFavorite(mapObjectId, userId, element) {
    const isFavorite = element.classList.contains('heart-filled');
    const endpoint = isFavorite ? '/api/users/RemoveFavorite' : '/api/users/AddFavorite';

    try {
        const formData = new FormData();
        formData.append('userID', userId);
        formData.append('mapObjectID', mapObjectId);

        const response = await fetch(endpoint, {
            method: isFavorite ? 'DELETE' : 'POST',
            body: formData
        });

        if (response.ok) {
            element.classList.toggle('heart-filled', !isFavorite);
            element.classList.toggle('heart-outline', isFavorite);
        } else {
            const error = await response.text();
            console.error('Ошибка при обновлении статуса фаворита:', error);
        }
    } catch (error) {
        console.error('Ошибка при переключении статуса фаворита:', error);
    }
}

// Перевод даты в заданный формат
function formatDate(dateString) {
    const date = new Date(dateString);
    const options = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    };
    return date.toLocaleString('ru-RU', options);
}

// Открыть меню
function openMenu() {
    const menu = document.querySelector(".slide-menu");
    menu.style.display = "block";
    setTimeout(() => {
        menu.classList.add("active");
    }, 10);
}

// Закрыть меню
function closeMenu() {
    const menu = document.querySelector(".slide-menu");
    menu.classList.remove("active");
    setTimeout(() => {
        menu.style.display = "none";
    }, 400);
}

// Переключатель пунктов меню
function showBlock(blockId) {
    const blocks = document.querySelectorAll('.toolbar-content');
    blocks.forEach(block => block.classList.add('hidden'));

    const selectedBlock = document.getElementById(blockId);
    if (selectedBlock) {
        selectedBlock.classList.remove('hidden');
    }
    if (blockId == "toolbar-content-3"){
        fetchRecommendationsByUserId();
    }

    if (blockId == "toolbar-content-4"){
        fetchPopularRecommendations();
    }

    closeMenu();
}

// Открыть детали
function showDetails(id) {
    fetch(`/api/SocialMapObject/GetSocialMapObjectById/${id}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Ошибка HTTP: ${response.status}`);
            }
            return response.json();
        })
        .then(object => {

            const detailsContent = document.getElementById("details-content");
            detailsContent.innerHTML = `
                <div class="comment-rating" id="rate-${object.id}">
                    ${generateStars(object.id, object.rating)}
                </div>
                <h3>${object.display_name}</h3>
                <p>${object.type}</p>
                <p>${object.adress}</p>
                <div class="buttons">
                <button class="write-comments-button" data-id="${object.id}">Оставить комментарий</button>
                <button class="show-comments-button" data-id="${object.id}">Показать комментарии</button>
                </div>
                <div id="commentForm">

                </div>
                <div id="loading-spinner" style="display: none;">
                    <div class="spinner"></div>
                    <p>Отправка комментария...</p>
                </div>
                <div id="comments-container"></div>
                `;
            const detailsContainer = document.getElementById("details-container");
            detailsContainer.classList.remove("hidden");
            detailsContainer.classList.add("show");
        })
        .catch(error => {
            console.error("Ошибка получения данных объекта:", error);
        });
}

// Закрыть контейнер для деталей
function closeDetails() {
    const detailsContainer = document.getElementById("details-container");
    detailsContainer.classList.add("hidden");
    detailsContainer.classList.remove("show");
}

// Переключатель видимости блока для фильтров
function toggleFilter() {
    const filterContainer = document.getElementById('toolbar-filter');
    filterContainer.classList.toggle('hidden');
}

// Закрыть блок для фильтров
function closeFilter() {
    const filterContainer = document.getElementById('toolbar-filter');
    filterContainer.classList.add('hidden');
} 

// Загрузка рекомендаций для всех пользователей
function fetchPopularRecommendations() {
    axios.get(`/api/recommendation/GetPopularRecommendations`)
    .then(response => {
        const recommendations = response.data.map(rec => {
            return Object.fromEntries(
                Object.entries(rec).filter(([key]) => !key.startsWith('$'))
            );
            });
            
            recommendationsArray = recommendations.map((rec, index) => ({
                id: rec.id !== undefined ? rec.id : `${index}`,
                mapObject: rec,
                distance: rec.distance || 0
            }));
            flag = false;
            const container = document.getElementById('recommendations-container-pop');
            container.innerHTML = '';

            if (Array.isArray(recommendationsArray) && recommendationsArray.length > 0) {
                recommendationsArray.forEach(rec => {
                    container.innerHTML += `
                        <div class="comment" onclick="focusOnMap(${rec.mapObject.id})">
                          <h3>${rec.mapObject.display_name}</h3>
                          <p>Категория: ${rec.mapObject.type}</p>
                          <p>Адрес: ${rec.mapObject.adress}</p>
                       </div>
                    `;
                });
            } else {
                container.innerHTML = '<p>Нет доступных рекомендаций.</p>';
            }
        })
        .catch(error => {
            console.error(error);
            const container = document.getElementById('recommendations-container');
            container.innerHTML = '<p>Произошла ошибка при загрузке рекомендаций.</p>';
        });
}

// Загрузка рекомендаций по конкретному пользователю
function fetchRecommendationsByUserId() {
    const container = document.getElementById('recommendations-container');
    const block = document.getElementById('toolbar-content-3');
    if (typeof userId === 'undefined' || userId === null){
        
        block.innerHTML = '';
        block.innerHTML = '<p>Доступно только для зарегистрированных пользователей!</p>';
        const buttons = document.createElement('div');
        buttons.classList.add('buttons');

        const button = document.createElement('button');
        button.textContent = 'Зарегистрироваться';
        button.setAttribute('onclick', ``);

        buttons.appendChild(button);
        block.appendChild(buttons);
        return;
    }
    axios.get(`/api/recommendation/GetRecommendationsByUserId/${userId}`)
    .then(response => {
        const recommendations = response.data.map(rec => {
            return Object.fromEntries(
                Object.entries(rec).filter(([key]) => !key.startsWith('$'))
            );
            });
            
            recommendationsArray = recommendations.map((rec, index) => ({
                id: rec.id !== undefined ? rec.id : `${index}`,
                mapObject: rec,
                distance: rec.distance || 0 
            }));
            flag = true;
            const container = document.getElementById('recommendations-container');
            container.innerHTML = '';

            if (Array.isArray(recommendationsArray) && recommendationsArray.length > 0) {
                recommendationsArray.forEach(rec => {
                    container.innerHTML += `
                        <div class="comment" onclick="focusOnMap(${rec.mapObject.id})">
                          <h3>${rec.mapObject.display_name}</h3>
                          <p>Категория: ${rec.mapObject.type}</p>
                          <p>Адрес: ${rec.mapObject.adress}</p>
                          <div class="buttons">
                            <button onclick="removeRecommendation(${rec.mapObject.id}, ${userId})">Не рекомендовать</button>
                          </div>
                       </div>

                    `;
                });
            } else {
                container.innerHTML = '<p>Нет доступных рекомендаций.</p>';
            }
        })
        .catch(error => {
            console.error(error);
            const container = document.getElementById('recommendations-container');
            container.innerHTML = '<p>Произошла ошибка при загрузке рекомендаций.</p>';
        });
}

// Удаление рекомендации из списка
function removeRecommendation(mapObjectId, userId) {
    axios.delete(`/api/recommendation/RemoveRecommendation/${mapObjectId}/${userId}`)
        .then(() => fetchRecommendationsByUserId())
        .catch(error => console.error(error));
}

// Загрузка отфильтрованных рекомендаций
function fetchRecommendationsFiltering() {
    event.preventDefault();

    const selectedCategories = [];
    document.querySelectorAll('input[name="categories"]:checked').forEach(el => {
        selectedCategories.push(el.value);
    });

    const selectedAccessibility = [];
    document.querySelectorAll('input[name="accessibility"]:checked').forEach(el => {
        selectedAccessibility.push(el.value);
    });

    const filterOptions = {
        userId,
        Categories: selectedCategories,
        AccessibilityElements: selectedAccessibility
    };

    function removeMetadata(obj, isRoot = true) {
        if (obj && typeof obj === 'object') {
            return Object.fromEntries(
                Object.entries(obj)
                    .filter(([key]) => isRoot || key !== '$id') 
                    .map(([key, value]) => [key, removeMetadata(value, false)])
            );
        }
        return obj;
    }

    const API = flag 
        ? `/api/recommendation/GetFilteringIntersectedData`
        : `/api/recommendation/GetFilteringPopularData`;

    axios.post(API, filterOptions)
        .then(response => {
            const recommendations = response.data.map(rec => removeMetadata(rec));

            const container = document.getElementById(
                flag ? 'recommendations-container' : 'recommendations-container-pop'
            );
            container.innerHTML = ''; 

            if (Array.isArray(recommendations) && recommendations.length > 0) {
                recommendations.forEach(rec => {
                    const comment = document.createElement('div');
                    comment.classList.add('comment');
                    comment.setAttribute('onclick', `focusOnMap(${rec.mapObject.id})`);

                    const title = document.createElement('h3');
                    title.textContent = rec.mapObject.display_name;

                    const category = document.createElement('p');
                    category.textContent = `Категория: ${rec.mapObject.type}`;

                    const address = document.createElement('p');
                    address.textContent = `Адрес: ${rec.mapObject.adress}`;

                    comment.appendChild(title);
                    comment.appendChild(category);
                    comment.appendChild(address);

                    if (flag) {
                        const buttons = document.createElement('div');
                        buttons.classList.add('buttons');

                        const button = document.createElement('button');
                        button.textContent = 'Не рекомендовать';
                        button.setAttribute('onclick', `removeRecommendation(${rec.mapObject.id}, ${userId})`);

                        buttons.appendChild(button);
                        comment.appendChild(buttons);
                    }

                    container.appendChild(comment);
                });
            } else {
                container.innerHTML = '<p>Нет доступных рекомендаций по выбранным фильтрам.</p>';
            }
        })
        .catch(error => {
            console.error(error);
            const container = document.getElementById(
                flag ? 'recommendations-container' : 'recommendations-container-pop'
            );
            container.innerHTML = '<p>Произошла ошибка при загрузке фильтрованных рекомендаций.</p>';
        });
}

// Загрузка отсортированных по удаленности рекомендаций
async function sortRecommendationsByDistance() {
    try {
        const userLocation = await getUserLocation();
        console.log(recommendationsArray);
        const response = await fetch(`/api/recommendation/SortRecommendations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                Recommendations: recommendationsArray,
                UserLatitude: userLocation.latitude,
                UserLongitude: userLocation.longitude 
            })
        });

        const sortedRecommendations = await response.json();
        console.log(sortedRecommendations);
        renderRecommendations(sortedRecommendations); 
    } catch (error) {
        console.error(error);
        document.getElementById('recommendations-container').innerHTML = '<p>Произошла ошибка при сортировке рекомендаций.</p>';
    }
}

// Получение координат Пользователя
function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    });
                },
                (error) => {
                    reject(error);
                }
            );
        } else {
            reject(new Error('Geolocation не поддерживается вашим браузером'));
        }
    });
}

// Сортировка рекомендаций
function renderRecommendations(recommendations) {
    var container;
    if (flag) {
        container = document.getElementById('recommendations-container'); 
    } else {
        container = document.getElementById('recommendations-container-pop');
    }
    container.innerHTML = ''; 

    if (recommendations.length > 0) {
        recommendations.forEach(rec => {
            const comment = document.createElement('div');
            comment.classList.add('comment');
            comment.setAttribute('onclick', `focusOnMap(${rec.mapObject.id})`);

            comment.innerHTML = `
                <h3>${rec.mapObject.display_name}</h3>
                <p>Категория: ${rec.mapObject.type}</p>
                <p>Адрес: ${rec.mapObject.adress}</p>
                <p>От Вас находится на расстоянии: ${rec.distance ? rec.distance.toFixed(2) + ' км' : 'Неизвестно'}</p>
            `;

            if (flag) {
                const buttons = document.createElement('div');
                buttons.classList.add('buttons');
                buttons.innerHTML = `
                    <button onclick="removeRecommendation(${rec.mapObject.id}, ${userId})">Не рекомендовать</button>
                `;
                comment.appendChild(buttons); 
            }

            container.appendChild(comment);
        });
    } else {
        container.innerHTML = '<p>Нет доступных рекомендаций по выбранным фильтрам.</p>';
    }
}

// Функция для отправки комментария на сервер
async function sendComment(data, uniqueId) {
    const loadingSpinner = document.getElementById('loading-spinner');
    
    loadingSpinner.style.display = 'flex';
    try {
        console.log(data);
        const response = await fetch('/api/comment/AddComment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        loadingSpinner.style.display = 'none';
        console.log(result.isOffensive);
        if (result.isOffensive) {
            const userConfirmation = confirm(
                `Ваш комментарий был изменён из-за нецензурных слов.\n\nИзменённый текст: "${result.modifiedText}".\n\nВы согласны отправить изменённый комментарий?`
            );

            if (userConfirmation) {
                await confirmComment(result.modifiedText, data.rate, data.mapObjectId, uniqueId);
            } else {
                alert('Комментарий отменён.');
                
            }
        } else {
            alert('Комментарий успешно добавлен!');
        }
        document.getElementById(`comment-${uniqueId}`).remove();
    } catch (error) {
        //alert(`Произошла ошибка: ${error.message}`);
        loadingSpinner.style.display = 'none';
        //document.getElementById(`comment-${uniqueId}`).remove(); 
    }
}

// Проверка комментария на цензуру
async function confirmComment(modifiedText, rate, mapObjectId) {
    const data = {
        text: modifiedText,
        rate: rate,
        userId: userId,
        mapObjectId: mapObjectId
    };

    try {
        const response = await fetch('/api/comment/AddComment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!result.isOffensive) {
            alert('Комментарий успешно добавлен с изменениями!');
        }
    } catch (error) {
        alert(`Произошла ошибка: ${error.message}`);
    }
}

// ---- Проложить маршрут (в меню карты) ----
let routeLayersOnMap = [];
const ROUTE_OBJECT_RADIUS_M = 80;
/** Пары цветов (участок с объектами в БД / без) для каждого из альтернативных маршрутов */
const ROUTE_VARIANT_PALETTE = [
  { withData: '#28a745', withoutData: '#fd7e14' },
  { withData: '#0d9488', withoutData: '#f59e0b' },
  { withData: '#7c3aed', withoutData: '#db2777' }
];

let routePickMode = null; // null | 'from' | 'to'
let routeFromMarker = null;
let routeToMarker = null;

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isPointNearObjects(lat, lon, radiusM) {
  if (!objects || !Array.isArray(objects)) return false;
  for (const o of objects) {
    const oLat = o.x != null ? o.x : o.X;
    const oLon = o.y != null ? o.y : o.Y;
    if (oLat == null || oLon == null) continue;
    if (distanceMeters(lat, lon, oLat, oLon) <= radiusM) return true;
  }
  return false;
}

async function nominatimGeocode(address) {
  const q = encodeURIComponent(String(address).trim());
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
    headers: {
      'Accept-Language': 'ru',
      // Политика OSM: без User-Agent поиск часто пустой или блокируется
      'User-Agent': 'MAPIP-AccessibilityMap/1.0 (education; map route geocoding)'
    }
  });
  if (!res.ok) throw new Error('Ошибка геокодирования (код ' + res.status + '). Попробуйте координаты или клик по карте.');
  const data = await res.json();
  if (!data || data.length === 0) {
    throw new Error('Адрес не найден в OpenStreetMap: «' + address + '». Введите точнее (город, улица) или координаты вида 51.533, 46.034');
  }
  return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
}

/** Декодирование encoded polyline (OpenRouteService / Google), precision 5 или 6. */
function decodePolyline(encoded, precision) {
  const p = precision === 6 ? 6 : 5;
  const factor = Math.pow(10, p);
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates = [];
  if (!encoded || typeof encoded !== 'string') return coordinates;
  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;
    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}

function geometryToLatLngRoute(geom) {
  if (!geom) return [];
  if (typeof geom === 'string') {
    let pts = decodePolyline(geom, 5);
    if (pts.length < 2) pts = decodePolyline(geom, 6);
    return pts;
  }
  const out = [];
  const pushRing = (ring) => {
    if (!ring || !ring.length) return;
    for (const c of ring) {
      if (!Array.isArray(c) || c.length < 2) continue;
      out.push([c[1], c[0]]);
    }
  };
  if (geom.type === 'LineString' && geom.coordinates) pushRing(geom.coordinates);
  else if (geom.type === 'MultiLineString' && geom.coordinates) {
    for (const line of geom.coordinates) pushRing(line);
  } else if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
    for (const g of geom.geometries) {
      const part = geometryToLatLngRoute(g);
      for (const p of part) out.push(p);
    }
  }
  return out;
}

/** Все варианты маршрута из ответа ORS: массив линий [[lat,lon], ...], ...] */
function extractAllRoutesFromOrs(ors) {
  const routes = [];
  const pushIfOk = (coords) => {
    if (coords && coords.length >= 2) routes.push(coords);
  };

  if (ors && Array.isArray(ors.features) && ors.features.length > 0) {
    for (const f of ors.features) {
      pushIfOk(geometryToLatLngRoute(f && f.geometry));
    }
    if (routes.length) return routes;
  }

  if (ors && Array.isArray(ors.routes) && ors.routes.length > 0) {
    for (const r of ors.routes) {
      pushIfOk(geometryToLatLngRoute(r && r.geometry));
    }
  }

  if (!routes.length && ors && ors.type === 'Feature' && ors.geometry) {
    pushIfOk(geometryToLatLngRoute(ors.geometry));
  }

  return routes;
}

/** Одна линия (совместимость): первая альтернатива или склейка. */
function orsResponseToLatLngCoords(ors) {
  const all = extractAllRoutesFromOrs(ors);
  return all.length ? all[0] : [];
}

/** Парсинг «широта, долгота» для региона РФ (и общий fallback). */
function parseLatLonFromText(text) {
  const m = String(text).trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]+\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const latOk = (x) => x >= 41 && x <= 82;
  const lonOk = (x) => x >= 10 && x <= 190;
  if (latOk(a) && lonOk(b)) return [a, b];
  if (latOk(b) && lonOk(a)) return [b, a];
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return [a, b];
  return null;
}

function setRoutePickMode(mode) {
  routePickMode = mode;
  const mapEl = map && map.getContainer();
  if (mapEl) mapEl.style.cursor = mode ? 'crosshair' : '';
  const bf = document.getElementById('routePickFromBtn');
  const bt = document.getElementById('routePickToBtn');
  if (bf) bf.style.outline = mode === 'from' ? '2px solid #3388ff' : '';
  if (bt) bt.style.outline = mode === 'to' ? '2px solid #3388ff' : '';
}

async function buildRouteOnMap(fromCoord, toCoord, profile, alternativeCount) {
  const alt = alternativeCount != null ? alternativeCount : 1;
  const res = await fetch('/api/routebuild/Build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromCoord,
      to: toCoord,
      profile: profile || 'foot-walking',
      alternativeCount: alt
    })
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text);
      if (j.error) msg = j.error;
    } catch (_) {}
    throw new Error(msg || 'Ошибка построения маршрута');
  }
  return JSON.parse(text);
}

function clearRoutePolylinesOnly() {
  routeLayersOnMap.forEach(l => { try { map.removeLayer(l); } catch (_) {} });
  routeLayersOnMap = [];
}

/** Полный сброс: линии + маркеры точек на карте */
function clearRouteOnMap() {
  clearRoutePolylinesOnly();
  if (routeFromMarker) { try { map.removeLayer(routeFromMarker); } catch (_) {} routeFromMarker = null; }
  if (routeToMarker) { try { map.removeLayer(routeToMarker); } catch (_) {} routeToMarker = null; }
}

/**
 * Один вариант маршрута: сегменты зелёный/оранжевый (или цвета из palette).
 * @param {number} variantIndex — индекс в ROUTE_VARIANT_PALETTE
 */
function drawOneRouteVariantOnMap(coords, variantIndex) {
  const pal = ROUTE_VARIANT_PALETTE[variantIndex % ROUTE_VARIANT_PALETTE.length];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const midLat = (a[0] + b[0]) / 2;
    const midLon = (a[1] + b[1]) / 2;
    const hasData = isPointNearObjects(midLat, midLon, ROUTE_OBJECT_RADIUS_M);
    const color = hasData ? pal.withData : pal.withoutData;
    const line = L.polyline([a, b], { color, weight: 5 + (variantIndex === 0 ? 1 : 0), opacity: 0.88 - variantIndex * 0.06 }).addTo(map);
    routeLayersOnMap.push(line);
  }
}

function drawAllRouteVariantsOnMap(routesCoords) {
  clearRoutePolylinesOnly();
  const bounds = [];
  routesCoords.forEach((coords, idx) => {
    drawOneRouteVariantOnMap(coords, idx);
    coords.forEach(c => bounds.push(c));
  });
  if (bounds.length >= 2) map.fitBounds(L.latLngBounds(bounds).pad(0.12));
  updateRouteLegendMap(routesCoords.length);
}

function updateRouteLegendMap(n) {
  const el = document.getElementById('route-legend');
  if (!el) return;
  if (!n) {
    el.innerHTML = '';
    return;
  }
  const labels = ['Вариант 1 (зелёный/оранжевый по базе)', 'Вариант 2 (бирюзовый/янтарь)', 'Вариант 3 (фиолетовый/розовый)'];
  let html = '<strong>Легенда вариантов:</strong><br>';
  for (let i = 0; i < n; i++) {
    const p = ROUTE_VARIANT_PALETTE[i % ROUTE_VARIANT_PALETTE.length];
    html += `<span style="display:inline-block;width:10px;height:10px;background:${p.withData};margin-right:4px;vertical-align:middle;"></span>`;
    html += `<span style="display:inline-block;width:10px;height:10px;background:${p.withoutData};margin-right:6px;vertical-align:middle;"></span>`;
    html += (labels[i] || 'Вариант ' + (i + 1)) + '<br>';
  }
  el.innerHTML = html;
}

/** Разрешить координаты: dataset поля → парс чисел → Nominatim */
async function resolveRouteEndpoint(text, inputEl) {
  const t = String(text).trim();
  if (!t) return null;
  if (inputEl && inputEl.dataset.lat != null && inputEl.dataset.lon != null) {
    const la = parseFloat(inputEl.dataset.lat);
    const lo = parseFloat(inputEl.dataset.lon);
    if (Number.isFinite(la) && Number.isFinite(lo)) return [la, lo];
  }
  const parsed = parseLatLonFromText(t);
  if (parsed) return parsed;
  return nominatimGeocode(t);
}

function searchObjectsForRoute(query) {
  if (!objects || !Array.isArray(objects)) return [];
  const q = String(query).toLowerCase().trim();
  if (!q) return [];
  return objects.filter(obj => {
    const name = (obj.display_name || '').toLowerCase();
    const addr = (obj.adress || obj.address || '').toLowerCase();
    return name.includes(q) || addr.includes(q);
  });
}

function setupRouteAddressAutocomplete(inputId, suggestionsId) {
  const input = document.getElementById(inputId);
  const container = document.getElementById(suggestionsId);
  if (!input || !container) return;
  input.addEventListener('input', function () {
    delete this.dataset.lat;
    delete this.dataset.lon;
    container.innerHTML = '';
    const results = searchObjectsForRoute(this.value);
    results.slice(0, 8).forEach(obj => {
      const div = document.createElement('div');
      div.className = 'search-suggestion';
      div.textContent = (obj.display_name || '') + (obj.adress ? ' — ' + obj.adress : '');
      div.addEventListener('click', () => {
        input.value = (obj.display_name || '') + (obj.adress ? ', ' + obj.adress : '');
        input.dataset.lat = obj.x != null ? obj.x : obj.X;
        input.dataset.lon = obj.y != null ? obj.y : obj.Y;
        container.innerHTML = '';
      });
      container.appendChild(div);
    });
  });
  document.addEventListener('click', function (e) {
    if (!container.contains(e.target) && e.target !== input) container.innerHTML = '';
  });
}

document.addEventListener('DOMContentLoaded', function () {
  setupRouteAddressAutocomplete('addressX', 'suggestionsX');
  setupRouteAddressAutocomplete('addressY', 'suggestionsY');

  const btn = document.getElementById('routeBuildButton');
  const clr = document.getElementById('routeClearButton');
  const addressX = document.getElementById('addressX');
  const addressY = document.getElementById('addressY');
  const typeRoute = document.getElementById('typeRoute');
  const pickFrom = document.getElementById('routePickFromBtn');
  const pickTo = document.getElementById('routePickToBtn');

  map.on('click', function (e) {
    if (!routePickMode) return;
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    const label = lat.toFixed(5) + ', ' + lon.toFixed(5);
    if (routePickMode === 'from' && addressX) {
      addressX.value = label;
      addressX.dataset.lat = String(lat);
      addressX.dataset.lon = String(lon);
      if (routeFromMarker) map.removeLayer(routeFromMarker);
      routeFromMarker = L.marker([lat, lon]).addTo(map).bindPopup('Старт маршрута');
    } else if (routePickMode === 'to' && addressY) {
      addressY.value = label;
      addressY.dataset.lat = String(lat);
      addressY.dataset.lon = String(lon);
      if (routeToMarker) map.removeLayer(routeToMarker);
      routeToMarker = L.marker([lat, lon]).addTo(map).bindPopup('Финиш маршрута');
    }
    setRoutePickMode(null);
  });

  if (pickFrom) pickFrom.addEventListener('click', function () {
    setRoutePickMode(routePickMode === 'from' ? null : 'from');
  });
  if (pickTo) pickTo.addEventListener('click', function () {
    setRoutePickMode(routePickMode === 'to' ? null : 'to');
  });
  if (clr) clr.addEventListener('click', function () {
    clearRouteOnMap();
    updateRouteLegendMap(0);
    setRoutePickMode(null);
  });

  if (!btn || !addressX || !addressY) return;

  btn.addEventListener('click', async function () {
    const fromText = addressX.value.trim();
    const toText = addressY.value.trim();
    if (!fromText || !toText) {
      alert('Укажите «Откуда» и «Куда» (адрес, координаты или точка на карте).');
      return;
    }
    const profile = (typeRoute && typeRoute.value) ? typeRoute.value : 'foot-walking';
    btn.disabled = true;
    btn.textContent = 'Строим…';
    setRoutePickMode(null);
    try {
      let fromCoord;
      let toCoord;
      try {
        fromCoord = await resolveRouteEndpoint(fromText, addressX);
      } catch (e) {
        alert('Откуда: ' + (e.message || 'не удалось определить точку'));
        return;
      }
      try {
        toCoord = await resolveRouteEndpoint(toText, addressY);
      } catch (e) {
        alert('Куда: ' + (e.message || 'не удалось определить точку'));
        return;
      }
      if (fromCoord[0] === toCoord[0] && fromCoord[1] === toCoord[1]) {
        alert('Точки «Откуда» и «Куда» совпадают.');
        return;
      }
      const altCb = document.getElementById('routeAlternatives');
      const alternativeCount = altCb && altCb.checked ? 3 : 1;
      const ors = await buildRouteOnMap(fromCoord, toCoord, profile, alternativeCount);
      const errObj = ors && (ors.error || ors.Error);
      if (errObj) {
        const msg = typeof errObj === 'object' && errObj.message != null ? errObj.message : String(errObj);
        alert('Сервис маршрутов отклонил запрос: ' + msg + '\n\nПроверьте ключ API на сервере и выбранный способ передвижения.');
        return;
      }
      const allRoutes = extractAllRoutesFromOrs(ors);
      if (allRoutes.length >= 1) drawAllRouteVariantsOnMap(allRoutes);
      else {
        console.warn('Ответ маршрута без линии (смотрите объект):', ors);
        alert(
          'Маршрут на карте не построился: в ответе нет линии.\n\n' +
            'Что сделать:\n' +
            '1) Убедитесь, что на сервере задан ключ OpenRouteService (appsettings / OPENROUTE_API_KEY).\n' +
            '2) Снимите галочку «до трёх вариантов» и нажмите снова.\n' +
            '3) Для «На машине» точки должны быть у дорог; для пешего — не в поле/воде.\n' +
            '4) Попробуйте координаты: Откуда 51.533, 46.034 — Куда 51.540, 46.016 (пример для Саратова).'
        );
      }
    } catch (e) {
      const msg = e.message || 'Ошибка построения маршрута.';
      if (/alternative|option/i.test(msg)) {
        alert(msg + '\n\nПопробуйте профиль «Пешком» или «На машине», либо сообщите администратору.');
      } else {
        alert(msg);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Проложить';
    }
  });
});

