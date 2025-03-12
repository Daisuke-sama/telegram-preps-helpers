// ==UserScript==
// @name         TGStat Ads on competitor Parser
// @namespace    http://tampermonkey.net/
// @version      0.6
// @description  Парсинг данных со страниц каналов на TGStat с сохранением в IndexedDB для выбора каналов публикации рекламы.
// @author       You
// @match        https://tgstat.ru/channel/@*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Инициализация IndexedDB
    let db;
    const dbRequest = indexedDB.open('TGStatDB', 1);
    // Общие стили для всех кнопок
    const buttonStyles = {
        padding: '12px 20px',
        fontSize: '16px',
        color: 'white',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer',
        marginLeft: '10px',
        verticalAlign: 'middle'
    };

    dbRequest.onupgradeneeded = function(event) {
        db = event.target.result;
        const store = db.createObjectStore('channels', { keyPath: 'telegramLink' });
        store.createIndex('title', 'title', { unique: false });
    };

    dbRequest.onsuccess = function(event) {
        db = event.target.result;
    };

    dbRequest.onerror = function(event) {
        console.error('Ошибка открытия IndexedDB:', event.target.error);
    };

    // Функция для парсинга данных со страницы канала
    function parseChannelPage() {
        let result = {};

        // 1. Название канала (h1)
        const titleElement = document.querySelector('h1');
        result.title = titleElement ? titleElement.textContent.trim() : 'Не найдено';

        // 2. Ссылка на TGStat (channelUrl) и Telegram-канал (telegramLink)
        result.channelUrl = window.location.href;
        const channelHandle = result.channelUrl.split('@')[1];
        result.telegramLink = channelHandle ? `https://t.me/${channelHandle}` : 'Не найдено';

        // 3. Количество подписчиков (h2 внутри .sticky-right-column)
        const subscribersElement = document.querySelector('.sticky-right-column h2');
        result.subscribers = subscribersElement ? subscribersElement.textContent.trim() : 'Не найдено';

        // 4. Среднее количество публикаций за 7 дней
        const postsListContainer = document.querySelector('#posts-lists-container .posts-list');
        let averagePostsPer7Days = 'Не найдено';
        if (postsListContainer) {
            const postHeaders = postsListContainer.querySelectorAll('.post-header');
            let postDates = [];

            postHeaders.forEach(header => {
                const dateElement = header.querySelector('p small');
                if (dateElement) {
                    const dateText = dateElement.textContent.trim();
                    const date = parseDate(dateText);
                    if (date) {
                        console.log(`Спарсена дата: ${dateText} -> ${date}`);
                        postDates.push(date);
                    } else {
                        console.log(`Не удалось спарсить дату: ${dateText}`);
                    }
                } else {
                    console.log('Элемент <small> не найден в .post-header');
                }
            });

            if (postDates.length > 0) {
                averagePostsPer7Days = calculateAveragePosts(postDates);
            } else {
                averagePostsPer7Days = 'Нет данных о постах';
            }
        } else {
            console.log('Контейнер #posts-lists-container .posts-list не найден');
        }
        result.averagePostsPer7Days = averagePostsPer7Days;

        // Проверяем и сохраняем данные
        checkAndSaveToIndexedDB(result);
    }

    // Функция для преобразования текста даты в объект Date
    function parseDate(dateText) {
        const monthsEn = {
            'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
            'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
        };
        const monthsRu = {
            'янв': 0, 'фев': 1, 'мар': 2, 'апр': 3, 'май': 4, 'июн': 5,
            'июл': 6, 'авг': 7, 'сен': 8, 'окт': 9, 'ноя': 10, 'дек': 11
        };

        try {
            const parts = dateText.match(/(\d+)\s([a-zа-я]{3}),?\s*(\d+:\d+)?/i);
            if (parts) {
                const day = parseInt(parts[1]);
                const monthStr = parts[2].toLowerCase();
                const time = parts[3] || '00:00';
                const currentYear = new Date().getFullYear();

                let month;
                if (monthsEn[monthStr] !== undefined) {
                    month = monthsEn[monthStr];
                } else if (monthsRu[monthStr] !== undefined) {
                    month = monthsRu[monthStr];
                } else {
                    throw new Error('Неизвестный месяц');
                }

                return new Date(currentYear, month, day, ...time.split(':').map(Number));
            }
            return null;
        } catch (e) {
            console.error('Ошибка парсинга даты:', dateText, e);
            return null;
        }
    }

    // Функция для подсчета среднего количества постов за 7 дней
    function calculateAveragePosts(dates) {
        if (dates.length === 0) return 0;

        dates.sort((a, b) => b - a);
        const earliestDate = dates[dates.length - 1];
        const latestDate = dates[0];
        const timeDiffMs = latestDate - earliestDate;
        const daysDiff = timeDiffMs / (1000 * 60 * 60 * 24);

        if (daysDiff === 0) return dates.length;

        const postsPerDay = dates.length / daysDiff;
        const postsPer7Days = postsPerDay * 7;

        return postsPer7Days.toFixed(2);
    }

    // Функция для проверки и сохранения данных в IndexedDB
    function checkAndSaveToIndexedDB(data) {
        const transaction = db.transaction(['channels'], 'readwrite');
        const store = transaction.objectStore('channels');

        const request = store.get(data.telegramLink);

        request.onsuccess = function(event) {
            const existingData = event.target.result;
            let isUpdate = false;

            if (existingData) {
                const lastUpdated = new Date(existingData.lastUpdated).toLocaleString();
                const confirmUpdate = confirm(
                    `Канал ${data.title} уже есть в базе.\n` +
                    `Последнее обновление: ${lastUpdated}\n` +
                    `Текущие данные:\n` +
                    `- Подписчики: ${existingData.subscribers}\n` +
                    `- Среднее кол-во постов за 7 дней: ${existingData.averagePostsPer7Days}\n` +
                    `Новые данные:\n` +
                    `- Подписчики: ${data.subscribers}\n` +
                    `- Среднее кол-во постов за 7 дней: ${data.averagePostsPer7Days}\n` +
                    `Обновить данные?`
                );

                if (!confirmUpdate) {
                    console.log('Обновление отменено пользователем.');
                    return;
                }
                isUpdate = true; // Устанавливаем флаг обновления
            }

            const channelData = {
                telegramLink: data.telegramLink,
                channelUrl: data.channelUrl,
                title: data.title,
                subscribers: data.subscribers,
                averagePostsPer7Days: data.averagePostsPer7Days,
                lastUpdated: new Date().toISOString()
            };

            const saveRequest = store.put(channelData);
            saveRequest.onsuccess = function() {
                console.log('Данные сохранены/обновлены в IndexedDB:', channelData);
                const actionText = isUpdate ? 'обновлены' : 'добавлены';
                alert(
                    `Данные успешно ${actionText}!\n` +
                    `Канал: ${channelData.title}\n` +
                    `Ссылка TGStat: ${channelData.channelUrl}\n` +
                    `Ссылка Telegram: ${channelData.telegramLink}\n` +
                    `Подписчики: ${channelData.subscribers}\n` +
                    `Среднее кол-во постов за 7 дней: ${channelData.averagePostsPer7Days}`
                );
            };
            saveRequest.onerror = function(event) {
                console.error('Ошибка сохранения в IndexedDB:', event.target.error);
            };
        };

        request.onerror = function(event) {
            console.error('Ошибка проверки данных в IndexedDB:', event.target.error);
        };
    }

    function clearDatabase() {
        const confirmClear = confirm(
            'Внимание! Очистка базы данных приведет к удалению всех сохраненных данных о каналах. ' +
            'Вся предыдущая работа будет потеряна. Вы уверены, что хотите продолжить?'
        );

        if (confirmClear) {
            const transaction = db.transaction(['channels'], 'readwrite');
            const store = transaction.objectStore('channels');
            const clearRequest = store.clear();

            clearRequest.onsuccess = function() {
                console.log('База данных успешно очищена');
                alert('База данных успешно очищена!');
            };

            clearRequest.onerror = function(event) {
                console.error('Ошибка при очистке базы данных:', event.target.error);
                alert('Произошла ошибка при очистке базы данных.');
            };
        } else {
            console.log('Очистка базы данных отменена пользователем.');
        }
    }

    function exportToCSV() {
        const transaction = db.transaction(['channels'], 'readonly');
        const store = transaction.objectStore('channels');
        const request = store.getAll();
    
        request.onsuccess = function(event) {
            const channels = event.target.result;
            if (channels.length === 0) {
                alert('База данных пуста. Нет данных для экспорта.');
                return;
            }
    
            const csvHeader = 'Name,Ссылка,Подписчиков,Постов в неделю,Ссылка tgstat\n';
            const csvRows = channels.map(channel => {
                return `"${channel.title}","${channel.telegramLink}","${channel.subscribers}","${channel.averagePostsPer7Days}","${channel.channelUrl}"`;
            }).join('\n');
            const csvContent = csvHeader + csvRows;
    
            // Создаем и скачиваем файл
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `tgstat_channels_export_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            console.log('Данные экспортированы в CSV');
        };
    
        request.onerror = function(event) {
            console.error('Ошибка при экспорте данных из IndexedDB:', event.target.error);
            alert('Произошла ошибка при экспорте данных.');
        };
    }

    // Функция для создания кнопки с применением стилей
    function createButton(text, bgColor, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        Object.assign(button.style, buttonStyles, { backgroundColor: bgColor });
        button.addEventListener('click', onClick);
        return button;
    }

    // Функция рендеринга кнопок управления
    function renderControls() {
        const parseButton = createButton('Парсить канал', '#4CAF50', () => {
            console.log('Кнопка нажата, начинаем парсинг...');
            parseChannelPage();
        });

        const clearButton = createButton('Очистить базу', '#f44336', () => {
            console.log('Кнопка очистки базы нажата...');
            clearDatabase();
        });

        const exportButton = createButton('Экспорт в CSV', '#2196F3', () => {
            console.log('Кнопка экспорта в CSV нажата...');
            exportToCSV();
        });

        const h1Element = document.querySelector('h1');
        if (h1Element) {
            h1Element.insertAdjacentElement('afterend', parseButton);
            parseButton.insertAdjacentElement('afterend', clearButton);
            clearButton.insertAdjacentElement('afterend', exportButton);
        } else {
            console.error('Элемент h1 не найден, кнопки не добавлены.');
            document.body.appendChild(parseButton);
            document.body.appendChild(clearButton);
            document.body.appendChild(exportButton);
        }
    }

    // Добавляем кнопку при загрузке страницы
    window.addEventListener('load', function() {
        renderControls();
    });
})();
