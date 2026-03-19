const useCurrentLocationCheckbox = document.getElementById('useCurrentLocation');
const latitudeInput = document.getElementById('latitude');
const longitudeInput = document.getElementById('longitude');
const provider = new GeoSearch.OpenStreetMapProvider();
const addressInput = document.getElementById('addressInput');
const suggestionsContainer = document.getElementById('suggestions');

const map = L.map('map').setView([51.533557, 46.034257], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

$(document).ready(function() {
    $('#type').on('change', function() {
        const selectedType = $(this).val();

        if (selectedType === "Социальная инфраструктура") {
            $('#socialInfrastructureFields').show();
            loadInfrastructureElements();
        } else {
            $('#socialInfrastructureFields').hide();
        }
    });

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
});

const attributionControl = document.querySelector('.leaflet-control-attribution');
if (attributionControl) {
    attributionControl.remove();
}

async function loadInfrastructureElements() {
    try {
        const response = await fetch(`/api/admin/get/infrastructure`);
        const data = await response.json();
        const container = document.getElementById('container-for_category');
        container.innerHTML = '';

        let selectedRadio = null;

        for (const [type, info] of Object.entries(data)) {
            if (type === "$id") continue; 

            const categories = info || []; 

            const typeContainer = document.createElement('div');
            typeContainer.className = 'type-container';

            const typeHeader = document.createElement('div');
            typeHeader.className = 'type-header';

            const toggleIcon = document.createElement('span');
            toggleIcon.className = 'toggle-icon';
            toggleIcon.textContent = '➡️'; 

            const typeLabel = document.createElement('span');
            typeLabel.textContent = type;
            typeLabel.className = 'type-label';

            const categoryContainer = document.createElement('div');
            categoryContainer.className = 'category-container';
            categoryContainer.style.display = 'none';

            categories.forEach((category) => {
                const categoryRadio = document.createElement('input');
                categoryRadio.type = 'radio';
                categoryRadio.name = 'infrastructure'; 
                categoryRadio.className = 'category-radio';
                categoryRadio.value = `${category}`; 

                categoryRadio.addEventListener('change', (event) => {
                    if (selectedRadio) {
                        selectedRadio.checked = false; 
                    }
                    selectedRadio = event.target;
                });

                const categoryLabel = document.createElement('label');
                categoryLabel.textContent = category;

                categoryContainer.appendChild(categoryRadio);
                categoryContainer.appendChild(categoryLabel);
                categoryContainer.appendChild(document.createElement('br'));
            });

            typeHeader.addEventListener('click', () => {
                const isHidden = categoryContainer.style.display === 'none';
                categoryContainer.style.display = isHidden ? 'block' : 'none';
                toggleIcon.textContent = isHidden ? '⬇️' : '➡️'; 
            });

            typeHeader.appendChild(toggleIcon);
            typeHeader.appendChild(typeLabel);
            typeContainer.appendChild(typeHeader);
            typeContainer.appendChild(categoryContainer);

            container.appendChild(typeContainer);
        }
    } catch (error) {
        console.error('Ошибка при загрузке данных:', error);
    }
}

function submitForm() {
    const formData = new FormData();
    const categoryRadios = document.querySelectorAll('input[type="radio"]:checked');

    const form = document.getElementById('addObjectForm');

    const name = document.getElementById("name").value;
    const address = document.getElementById("address").value;
    const type = document.getElementById("type").value;

    if (!name || !address || !type) {
        console.error("Ошибка: Не заполнены обязательные поля.");
        alert("Пожалуйста, заполните обязательные поля: Название объекта, Адрес, Тип объекта.");
        return;
    }
    formData.append("name", name);
    formData.append("address", address);

    if (type === 'Социальная инфраструктура') {
        const selectedRadio = document.querySelector('input[type="radio"]:checked');
        if (!selectedRadio) {
            console.error("Ошибка: Категория для социальной инфраструктуры не выбрана.");
            alert("Пожалуйста, выберите категорию для социальной инфраструктуры.");
            return;
        }
        formData.append("type", selectedRadio.value); 
    } else {
        formData.append("type", type);
    }
    formData.append("userId", userId);
    const description = document.getElementById("description").value;
    if (description) formData.append("description", description);

    const workingHours = document.getElementById("workingHours").value;
    if (workingHours) formData.append("workingHours", workingHours);

    const images = document.getElementById("images").files;
    for (let i = 0; i < images.length; i++) {
        formData.append("images", images[i]);
    }

    const accessibilityCheckboxes = document.querySelectorAll('input[name="accessibility"]:checked');
    if (accessibilityCheckboxes.length > 0) {
        accessibilityCheckboxes.forEach(checkbox => formData.append("accessibility", checkbox.value));
    }

    const disabilityCategoryCheckboxes = document.querySelectorAll('input[name="disabilityCategory"]:checked');
    if (disabilityCategoryCheckboxes.length > 0) {
        disabilityCategoryCheckboxes.forEach(checkbox => formData.append("disabilityCategory", checkbox.value));
    }

    fetch("/client/AddMapObject", {
        method: "POST",
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(text => { throw new Error(`Ошибка при отправке формы: ${text}`); });
        }

        return response.json();
    })
    .catch(error => console.error("Ошибка:", error));
    form.reset();
    socialInfrastructureFields.style.display = 'none';
    alert('Форма успешно отправлена!');
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

async function reverseGeocode(latitude, longitude, radiusInMeters = 500) {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1&limit=10`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Ошибка при обращении к сервису геокодирования.');
        }
        const data = await response.json();
        console.log(data);
        
        const filteredResults = data.filter(result => {
            if (result && result.address && result.address.road) {
                const resultLat = result.lat;
                const resultLon = result.lon;
                const distance = calculateDistance(latitude, longitude, resultLat, resultLon) * 1000; 
                return distance <= radiusInMeters; 
            }
            return false;
        });

        if (filteredResults.length > 0) {
            const closestAddress = filteredResults[0];
            const addr = closestAddress.address;
            let address = '';
            if (addr.road) address += addr.road + ', ';
            if (addr.city) address += addr.city + ', ';
            else if (addr.village) address += addr.village + ', ';
            if (addr.state) address += addr.state + ', ';
            if (addr.country) address += addr.country;
            return address.trim();
        }

        console.error('В радиусе 500 метров не найдено подходящих адресов.');
        return null;
    } catch (error) {
        console.error('Ошибка при геокодировании:', error);
        return null;
    }
}

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

document.addEventListener('click', (event) => {
    if (!suggestionsContainer.contains(event.target) && event.target !== addressInput) {
        suggestionsContainer.innerHTML = '';
    }
});

useCurrentLocationCheckbox.addEventListener('change', async () => {
    if (useCurrentLocationCheckbox.checked) {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async (position) => {
                const { latitude, longitude } = position.coords;

                latitudeInput.value = latitude;
                longitudeInput.value = longitude;

                const address = await reverseGeocode(latitude, longitude);
                if (address) {
                    addressInput.value = address;
                } else {
                    alert('Не удалось определить адрес.');
                }
            }, (error) => {
                console.error('Ошибка при получении местоположения:', error);
                alert('Не удалось получить доступ к местоположению.');
                useCurrentLocationCheckbox.checked = false; 
            });
        } else {
            alert('Геолокация не поддерживается вашим браузером.');
            useCurrentLocationCheckbox.checked = false; 
        }
    } else {
        addressInput.value = ''; 
        latitudeInput.value = '';
        longitudeInput.value = '';
    }
});


