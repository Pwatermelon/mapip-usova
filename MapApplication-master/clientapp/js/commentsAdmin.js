const apiUrl = 'http://localhost:5000/api/comment';
const container = document.getElementById('comments-container');
container.innerHTML = "<p class = 'messageCom'>Здесь будут отображены комментарии...</p>";

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

function fetchComments(nameRoute) {
    
    const container = document.getElementById('comments-container');
    const loadingSpinner = document.getElementById('loading-spinner');
    
    loadingSpinner.style.display = 'flex';
    if (!nameRoute.includes('GetCommentsByMapObject')) {
        container.innerHTML = ''; 
    }

    axios.get(`${apiUrl}/${nameRoute}`)
        .then(response => {
            const comments = response.data;
            
            loadingSpinner.style.display = 'none'; 
            loadingSpinner.style.display = 'none'; 
            if (comments.length === 0) {
                container.innerHTML += "<p class = 'messageCom'>Комментариев пока нет...</p>";
                return;
            }
            console.log(comments);
            comments.forEach(comment => {
                container.innerHTML += `
                    <div class="comment" id="comment-${comment.id}">
                        <div class="comment-header">
                            <p class="comment-date" >Дата добавления: ${formatDate(comment.date)}</p>
                            <p class="comment-user"><strong>${comment.user.name}</strong></p>
                            <div class="comment-rating" id="rate-${comment.id}">
                                ${generateStars(comment.id, comment.rate)}
                            </div>
                        </div>
                        <label for="text-${comment.id}">Текст:</label>
                        <input type="text" id="text-${comment.id}" value="${comment.text}">
                        <input type="hidden" id="rate-hidden-${comment.id}" value="${comment.rate}">
                        <div class="buttons">
                            <button onclick="saveComment(${comment.id})">Сохранить</button>
                            <button onclick="deleteComment(${comment.id})">Удалить</button>
                        </div>
                    </div>
                `;
                
                highlightStars(comment.id, comment.rate);
            });
            initializeStarRatingEvents();
        })
        .catch(error => {
            container.innerHTML = "<p class = 'messageCom'>Ошибка при загрузке комментариев...</p>";
            console.error(error);
            loadingSpinner.style.display = 'none';
        });
}

function generateStars(commentId, currentRating) {
    let starsHTML = '';
    for (let i = 1; i <= 5; i++) {
        starsHTML += `
            <span class="star" data-rating="${i}" data-comment-id="${commentId}">
                ★
            </span>
        `;
    }
    return starsHTML;
}

function initializeStarRatingEvents() {
    document.querySelectorAll('.star').forEach(star => {
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

function setRating(commentId, rating) {
    document.getElementById(`rate-hidden-${commentId}`).value = rating;
    highlightStars(commentId, rating);
}

function highlightStars(commentId, rating) {
    document.querySelectorAll(`#rate-${commentId} .star`).forEach(star => {
        const starRating = parseInt(star.getAttribute('data-rating'));
        star.style.color = starRating <= rating ? '#f0c808' : '#ccc';
    });
}

function saveComment(id) {
    const newText = document.getElementById(`text-${id}`).value;
    const newRate = document.getElementById(`rate-hidden-${id}`).value;
    if (newText && newRate) {
        axios.put(`${apiUrl}/EditComment/${id}`, { newText, newRate: parseInt(newRate) })
            .then(() => fetchComments())
            .catch(error => console.error(error));
    }
}

function deleteComment(id) {
    if (confirm('Вы уверены, что хотите удалить комментарий?')) {
        axios.delete(`${apiUrl}/DeleteComment/${id}`)
            .then(() => fetchComments())
            .catch(error => console.error(error));
    }
}

document.getElementById('load-last-comments').addEventListener('click', () => fetchComments("GetLastComments"));
document.getElementById('load-comments-of-search').addEventListener('click', () => {
    const container = document.getElementById('comments-container');

    container.innerHTML = '';
    container.innerHTML = `
    <form onsubmit="event.preventDefault();" role="search" class="search-form">
        <input id="search-inner" type="search" placeholder="Поиск комментариев по объекту..." class="search-input" autofocus required />
        <button id="search-inner-button" type="submit" class="search-button">Найти</button>
    </form>
    `;

    document.getElementById('search-inner-button').addEventListener('click', () => {
        const searchValue = document.getElementById('search-inner').value;
        if (searchValue.trim() !== '') {
            fetchComments(`GetCommentsByMapObject/${searchValue}`);
        } else {
            alert('Введите значение для поиска!');
        }
    });
});

document.getElementById('load-offensive-comments').addEventListener('click', () => fetchComments("GetOffensiveComments"));


document.addEventListener('DOMContentLoaded', function() {
    const buttons = document.querySelectorAll('.buttonsAd button');

    buttons.forEach(button => {
        button.addEventListener('click', function() {
            buttons.forEach(b => b.classList.remove('active'));
            button.classList.add('active');
        });
    });
});
