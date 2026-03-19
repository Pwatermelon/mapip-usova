let typeObject;
let addressObject;
let idObject;

$(document).ready(function() {
    const addressContainer = $('#addressContainer');
    fetch('/api/SocialMapObject/get/accessibility')
        .then(response => response.json())
        .then(data => {
            const items = Array.isArray(data) ? data : data;
            if (Array.isArray(items)) {
                const container = $('#accessibilityContainer');
                items.forEach(item => {
                    const checkbox = $('<input>').attr('type', 'checkbox').attr('name', 'accessibility').attr('value', item);
                    const label = $('<label>').text(item).prepend(checkbox);
                    
                    container.append(label);
                    container.append(document.createElement('br'));
                });
            }
        })
        .catch(error => console.error("Ошибка при загрузке элементов доступной среды:", error));
    
    function getSocialAddressTemplate() {
        return `
            <h4 for="address">Объект переехал? Вы знаете его новый адрес?</h4>
            <div style="margin-bottom: 15px;">
                <input type="checkbox" id="addressCheckbox">
                <label for="addressCheckbox">Да</label>
            </div>
            <div id="mapForAddress" style="display: none;">
                <h4 for="address">Адрес:</h4>
                <div class="search-container">
                    <input type="text" id="addressInput" class="search-input" placeholder="Введите адрес">
                    <div id="suggestions" class="search-suggestions"></div>
                </div>
                <div id="map"></div>
                <input type="hidden" id="address" name="address" required>
                <input type="hidden" id="latitude" name="latitude">
                <input type="hidden" id="longitude" name="longitude">
            </div>
        `;}

    function getTransportRoadAddressTemplate() {
        return `
            <div id="mapForAddress">
                <h4 for="address">Адрес:</h4>
                <input type="checkbox" id="useCurrentLocation">
                <label for="useCurrentLocation">Использовать текущее местоположение</label>
                <div class="search-container">
                    <input type="text" id="addressInput" class="search-input" placeholder="Введите адрес">
                    <div id="suggestions" class="search-suggestions"></div>
                </div>
                <div id="map"></div>
                <input type="hidden" id="address" name="address" required>
                <input type="hidden" id="latitude" name="latitude">
                <input type="hidden" id="longitude" name="longitude">
            </div>
        `;}
        
        function updateFormStructure() {
            const selectedType = $('#type').val();

            if (selectedType === "Социальная инфраструктура") {
                addressContainer.html(getSocialAddressTemplate());

                $('#socialInfrastructureFields').show();

                $('#addressCheckbox').on('change', function() {
                    $('#mapForAddress').toggle(this.checked);
                });
                
                setTimeout(() => {
                    $('#isExcluded').prop('checked', false).prop('disabled', false);
                }, 100);

            } else {
                addressContainer.html(getTransportRoadAddressTemplate());
                setTimeout(() => {
                    $('#isExcluded').prop('checked', true).prop('disabled', true);
                }, 100);
                
                $('#socialInfrastructureFields').hide();
            }
            
            initializeMap();
        }
        
        function initializeMap() {
            if ($('#map').length) {
                const map = L.map('map').setView([51.533557, 46.034257], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

                const provider = new GeoSearch.OpenStreetMapProvider();
                const addressInput = document.getElementById('addressInput');
                const suggestionsContainer = document.getElementById('suggestions');

                if (addressInput) {
                    addressInput.addEventListener('input', async () => {
                        const query = addressInput.value.trim();
                        if (query.length >= 1) {
                            const results = await provider.search({ query });
                            suggestionsContainer.innerHTML = '';
                            results.forEach(result => {
                                const suggestion = document.createElement('div');
                                suggestion.classList.add('search-suggestion');
                                suggestion.textContent = result.label;
                                suggestion.addEventListener('click', () => {
                                    addressInput.value = result.label;
                                    $('#address').val(result.label);
                                    $('#latitude').val(result.y);
                                    $('#longitude').val(result.x);

                                    map.setView([result.y, result.x], 16);
                                    L.marker([result.y, result.x]).addTo(map);

                                    suggestionsContainer.innerHTML = '';
                                });
                                suggestionsContainer.appendChild(suggestion);
                            });
                        } else {
                            suggestionsContainer.innerHTML = '';
                        }
                    });
                }
            }
        }

        $('#type').on('change', updateFormStructure);
        updateFormStructure();

    // Пример обработки выбора адреса из GeoSearch (адаптируйте под ваш код)
    // Предполагается, что у вас есть переменная 'provider' и инициализирован поиск.
    // Если вы используете другое событие или метод, измените этот код.
    $('#search-dropdown').on('change', function() {
        const selectedOption = $(this).find('option:selected');
        const lat = selectedOption.data('lat');
        const lon = selectedOption.data('lon');
        const address = selectedOption.val();

        // Заполняем скрытые поля координатами и адресом
        $('#latitude').val(lat);
        $('#longitude').val(lon);
        $('#objectAddress').val(address); // Заполняем скрытое поле адреса

        // Возможно, нужно обновить карту и установить маркер по новым координатам
        // map.setView([lat, lon], 16); // Пример
        // L.marker([lat, lon]).addTo(map); // Пример
    });

    // !!! Если вы редактируете существующий объект, вам нужно загрузить его данные
    // (включая IRI, координаты, адрес, MapObjectID) и заполнить форму
    // и скрытые поля при загрузке страницы. Ваш код должен делать это.
    // Пример (псевдокод):
    /*
    const objectIdToEdit = getObjectIdFromUrl(); // Функция для получения ID из URL
    if (objectIdToEdit) {
        fetch(`/api/SocialMapObject/GetSocialMapObjectById/${objectIdToEdit}`)
            .then(response => response.json())
            .then(data => {
                // Заполняем видимые поля формы данными из 'data'
                $('#name').val(data.display_name);
                $('#type').val(data.type);
                // ... заполнение других полей ...

                // Заполняем скрытые поля
                $('#latitude').val(data.y);
                $('#longitude').val(data.x);
                $('#objectAddress').val(data.adress); // Или data.address, в зависимости от поля в БД
                $('#objectIRI').val(data.iri);
                $('#objectMapObjectId').val(data.id); // ID из MapObject
                 $('#rating').val(data.rating); // Если рейтинг есть в БД

                // Возможно, нужно обновить карту
                // map.setView([data.y, data.x], 16);
                // L.marker([data.y, data.x]).addTo(map); // Пример
            })
            .catch(error => console.error('Ошибка загрузки данных объекта:', error));
    }
    */
});

function checkType() {
    const selectedType = $('#type').val();

    if (selectedType === "Социальная инфраструктура") {
        return typeObject;

    } else {
        return selectedType;
    }
}

function submitForm() {
    const form = $('#addObjectForm')[0];
    const formData = new FormData(form);

    // Добавляем дополнительные данные, если они не попали из скрытых полей автоматически
    // formData.append('latitude', $('#latitude').val()); // Если не скрытое поле
    // formData.append('longitude', $('#longitude').val()); // Если не скрытое поле
    // formData.append('iri', $('#objectIRI').val()); // Если не скрытое поле
    // formData.append('address', $('#objectAddress').val()); // Если не скрытое поле
    // formData.append('mapObjectId', $('#objectMapObjectId').val()); // Если не скрытое поле
    // formData.append('rating', $('#rating').val()); // Если не скрытое поле

    // Проверка наличия необходимых данных перед отправкой (опционально)
    if (!$('#latitude').val() || !$('#longitude').val() || !$('#objectAddress').val()) {
        alert('Пожалуйста, выберите адрес на карте.');
        return;
    }

    // !!! Убедитесь, что URL эндпоинта правильный для вашей логики добавления/редактирования
    // Если это редактирование, возможно, URL должен включать ID объекта
    const url = '/client/AddMapObject'; // Пример URL, измените при необходимости

    fetch(url, {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            // Обработка ошибок с сервера
            return response.text().then(text => { throw new Error(text) });
        }
        return response.text(); // Или response.json() если сервер возвращает JSON
    })
    .then(data => {
        console.log('Успех:', data);
        alert('Информация успешно отправлена!');
        // Возможно, перенаправление пользователя или очистка формы
    })
    .catch((error) => {
        console.error('Ошибка:', error);
        alert('Ошибка при отправке информации: ' + error.message);
    });
}

document.getElementById("search").addEventListener("input", async function (event) {
    const query = event.target.value.trim();
    const dropdown = document.getElementById("search-dropdown");

    if (!query) {
        dropdown.style.display = "none";
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
            dropdown.style.display = "none";
            return;
        }

        dropdown.innerHTML = "";
        data.forEach(obj => {
            const option = document.createElement("option");
            option.value = obj.id;
            option.textContent = obj.display_name;
            option.setAttribute("data-object", JSON.stringify(obj));
            dropdown.appendChild(option);
        });

        dropdown.style.display = "block";
    } catch (error) {
        console.error(error);
        dropdown.style.display = "none";
    }
});

document.getElementById("search-dropdown").addEventListener("change", function (event) {
    const selectedOption = event.target.options[event.target.selectedIndex];
    
    const objectData = selectedOption.getAttribute("data-object");
    const object = JSON.parse(objectData);

    document.getElementById("search").value = object.display_name;
    
    const address = document.getElementById("address");
    const description = document.getElementById("description");
    const workingHours = document.getElementById("workingHours");

    address.value = object.adress;
    description.value = object.description;
    workingHours.value = object.workingHours;

    addressObject = object.adress;
    typeObject = object.type;
    idObject = object.id;
    event.target.style.display = "none";

    fetch('/client/getOntologyInfo', {
        method: 'POST',
        body: new URLSearchParams({ iri: object.iri }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
        .then(response => response.json())
        .then(data => {
            const categories = data.categories || [];
            categories.forEach(category => {
                const pureCategory = category.split('^^')[0]; 
                const checkbox = document.getElementById(`disabilityCategory${pureCategory}`);
                if (checkbox) {
                    checkbox.checked = true; 
                } else {
                    console.warn(`Чекбокс для категории ${pureCategory} не найден.`);
                }
            });

            const accessibilityElements = data.accessibilityElements || [];
            accessibilityElements.forEach(element => {
                const checkbox = Array.from(document.querySelectorAll('input[name="accessibility"]')).find(
                    el => el.value === element
                );
                if (checkbox) {
                    checkbox.checked = true; 
                }
            });
        })
        .catch(error => {
            console.error("Ошибка при запросе данных:", error);
        });
});

const map = L.map('map').setView([51.533557, 46.034257], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);
  
const provider = new GeoSearch.OpenStreetMapProvider();
const addressInput = document.getElementById('addressInput');
const suggestionsContainer = document.getElementById('suggestions');

addressInput.addEventListener('input', async () => {
    const query = addressInput.value.trim();

    if (query.length >= 1) {
        const results = await provider.search({ query });

        const filteredResults = results.filter(result => {
            const labelContainsRussia = result.label?.toLowerCase().includes('россия');
            return labelContainsRussia;
        });

        suggestionsContainer.innerHTML = '';

        filteredResults.forEach(result => {
            const suggestion = document.createElement('div');
            suggestion.classList.add('search-suggestion');
            suggestion.textContent = result.label;

            suggestion.addEventListener('click', () => {
                addressInput.value = result.label;
                document.getElementById('address').value = result.label;
                document.getElementById('latitude').value = result.y;
                document.getElementById('longitude').value = result.x;

                map.setView([result.y, result.x], 16);
                L.marker([result.y, result.x]).addTo(map);

                suggestionsContainer.innerHTML = '';
            });

            suggestionsContainer.appendChild(suggestion);
        });
    } else {
        suggestionsContainer.innerHTML = '';
    }
});

const attributionControl = document.querySelector('.leaflet-control-attribution');
if (attributionControl) {
    attributionControl.remove();
}

document.addEventListener('click', (event) => {
    if (!suggestionsContainer.contains(event.target) && event.target !== addressInput) {
        suggestionsContainer.innerHTML = '';
    }
});

const checkbox = document.getElementById('addressCheckbox');
const mapForAddress = document.getElementById('mapForAddress');

checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
        mapForAddress.style.display = 'block';
    } else {
        mapForAddress.style.display = 'none';
    }
});