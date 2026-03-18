const form = document.getElementById('authForm');
const errorMessage = document.getElementById('errorMessage');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('http://localhost:5000/api/users/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            if (response.ok) {
                const data = await response.json();

                if (data.success) {
                    if (data.userId === 1)
                        {window.location.href = 'http://localhost:5000/clientapp/Settings.html';
                        }
                    else
                        {window.location.href = 'http://localhost:5000/clientapp/map.html';
                        }
                } else {
                    errorMessage.textContent = data.message || 'Ошибка авторизации';
                }
            } else {
                errorMessage.textContent = 'Ошибка сервера';
            }
        } catch (error) {
            console.error('Ошибка:', error);
            errorMessage.textContent = 'Произошла ошибка. Попробуйте позже.';
        }
    });
