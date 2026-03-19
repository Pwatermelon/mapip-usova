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
const ROUTE_COLOR_WITH_DATA = '#28a745';
const ROUTE_COLOR_NO_DATA = '#fd7e14';
const ROUTE_OBJECT_RADIUS_M = 80;

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
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, { headers: { 'Accept-Language': 'ru' } });
  if (!res.ok) throw new Error('Ошибка геокодирования');
  const data = await res.json();
  if (!data || data.length === 0) throw new Error('Адрес не найден: ' + address);
  return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
}

async function buildRouteOnMap(fromCoord, toCoord, profile) {
  const res = await fetch('/api/routebuild/Build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ From: fromCoord, To: toCoord, Profile: profile || 'foot-walking' })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(JSON.parse(text).error || text || 'Ошибка построения маршрута');
  return JSON.parse(text);
}

function clearRouteOnMap() {
  routeLayersOnMap.forEach(l => { try { map.removeLayer(l); } catch (_) {} });
  routeLayersOnMap = [];
}

function drawRouteSegmentsOnMap(coords) {
  clearRouteOnMap();
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const midLat = (a[0] + b[0]) / 2;
    const midLon = (a[1] + b[1]) / 2;
    const hasData = isPointNearObjects(midLat, midLon, ROUTE_OBJECT_RADIUS_M);
    const color = hasData ? ROUTE_COLOR_WITH_DATA : ROUTE_COLOR_NO_DATA;
    const line = L.polyline([a, b], { color, weight: 5, opacity: 0.8 }).addTo(map);
    routeLayersOnMap.push(line);
  }
  if (coords.length >= 2) map.fitBounds(L.latLngBounds(coords).pad(0.15));
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
  const addressX = document.getElementById('addressX');
  const addressY = document.getElementById('addressY');
  const typeRoute = document.getElementById('typeRoute');
  if (!btn || !addressX || !addressY) return;

  btn.addEventListener('click', async function () {
    const fromText = addressX.value.trim();
    const toText = addressY.value.trim();
    if (!fromText || !toText) {
      alert('Укажите «Откуда» и «Куда».');
      return;
    }
    let fromCoord = null;
    let toCoord = null;
    if (addressX.dataset.lat != null && addressX.dataset.lon != null)
      fromCoord = [parseFloat(addressX.dataset.lat), parseFloat(addressX.dataset.lon)];
    if (addressY.dataset.lat != null && addressY.dataset.lon != null)
      toCoord = [parseFloat(addressY.dataset.lat), parseFloat(addressY.dataset.lon)];
    if (!fromCoord) try { fromCoord = await nominatimGeocode(fromText); } catch (e) { alert(e.message); return; }
    if (!toCoord) try { toCoord = await nominatimGeocode(toText); } catch (e) { alert(e.message); return; }
    const profile = (typeRoute && typeRoute.value === 'Пешком') ? 'foot-walking' : 'foot-walking';
    btn.disabled = true;
    btn.textContent = 'Строим…';
    try {
      const ors = await buildRouteOnMap(fromCoord, toCoord, profile);
      const features = ors.features || [];
      const geom = features[0] && features[0].geometry;
      const coords = geom && geom.coordinates ? geom.coordinates.map(c => [c[1], c[0]]) : [];
      if (coords.length >= 2) drawRouteSegmentsOnMap(coords);
      else alert('Маршрут не найден.');
    } catch (e) {
      alert(e.message || 'Ошибка построения маршрута.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Проложить';
    }
  });
});

