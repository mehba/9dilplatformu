// --- API Ayarları ---
const apiKey = "AIzaSyA8o-fmOİrx2Hh8ZhPqPqS6GBM6fco"; // Kendi API anahtarınızı buraya (AIza ile başlayan kod) yapıştırın.

// --- API URL Tanımları ---
// Not: API Key URL'e dinamik olarak eklenecek, burada tanımlanmıyor.
const nanoBananaApiUrlBase = "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict";
const textApiUrlBase = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent";


// Dil kodlarını tam isimlere çevirmek için harita
const langMap = {
    'tr': 'Türkçe', 'en': 'English', 'es': 'Español', 'de': 'Deutsch', 
    'fr': 'Français', 'it': 'Italiano', 'ja': 'Japanese', 'ar': 'Arabic', 'ru': 'Russian'
};

// Sesli okuma için dil kodları (SpeechSynthesis)
const speechLangMap = {
    'tr': 'tr-TR', 'en': 'en-US', 'es': 'es-ES', 'de': 'de-DE',
    'fr': 'fr-FR', 'it': 'it-IT', 'ja': 'ja-JP', 'ar': 'ar-SA', 'ru': 'ru-RU'
};

// --- Veri Durumu ---
let currentSearchData = { word: '', translation: '', description: '', targetLang: 'en' };

// --- DOM Elementleri ---
const languageSelect = document.getElementById('language-select');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const messageBox = document.getElementById('message-box');

const resultCard = document.getElementById('result-card');
const resultWord = document.getElementById('result-word');
const headerSpeakBtn = document.getElementById('header-speak-btn');
const imageLoader = document.getElementById('image-loader');
const resultImage = document.getElementById('result-image');
const resultDescription = document.getElementById('result-description');
const translationOverlay = document.getElementById('translation-overlay');
const translationText = document.getElementById('translation-text');
const overlaySpeakBtn = document.getElementById('overlay-speak-btn');
const descriptionSpeakBtn = document.getElementById('description-speak-btn');

// --- Fonksiyonlar ---

// Sesli Okuma Fonksiyonu
function speakText(text, langCode, buttonElement) {
    if (!window.speechSynthesis) { alert("Tarayıcınız sesli okuma özelliğini desteklemiyor."); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLangMap[langCode] || 'en-US';
    utterance.rate = 0.9;
    if(buttonElement) {
        buttonElement.classList.add('speaking', 'text-pink-500');
    }
    utterance.onend = function() {
        if(buttonElement) {
            buttonElement.classList.remove('speaking', 'text-pink-500');
        }
    };
    window.speechSynthesis.speak(utterance);
}

// API çağrıları için yeniden deneme ve hata yakalama
async function fetchWithRetry(urlBase, payload, retries = 3, delay = 1000) {
    // API KEY KONTROLÜ
    if (!apiKey || apiKey.length < 10) {
        throw new Error("API_KEY_MISSING");
    }

    const url = `${urlBase}?key=${apiKey}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            // Hata Koduna Göre Özel Mesajlar
            if (response.status === 400) throw new Error("API_KEY_INVALID");
            if (response.status === 403) throw new Error("API_PERMISSION_DENIED");
            if (response.status === 429) {
                 if (retries > 0) {
                    await new Promise(res => setTimeout(res, delay));
                    return fetchWithRetry(urlBase, payload, retries - 1, delay * 2);
                }
                throw new Error("API_QUOTA_EXCEEDED");
            }
            throw new Error(`API Hatası: ${response.status}`);
        }
        return response.json();
    } catch (error) {
        if (retries > 0 && error.message !== "API_KEY_INVALID" && error.message !== "API_KEY_MISSING") {
            await new Promise(res => setTimeout(res, delay));
            return fetchWithRetry(urlBase, payload, retries - 1, delay * 2);
        }
        throw error;
    }
}

// Çeviri oluşturma
async function generateTranslation(word, targetLangCode) {
    const targetLangName = langMap[targetLangCode] || 'English';
    const prompt = `Translate the Turkish word "${word}" into ${targetLangName}. Return only the translated word, nothing else.`;
    const payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 20 } };

    const result = await fetchWithRetry(textApiUrlBase, payload);
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
        let cleanText = text.trim().replace(/^[^a-zA-Z0-9\u0600-\u06FF\u3040-\u309F\u30A0-\u30FF\s]+|[^a-zA-Z0-9\u0600-\u06FF\u3040-\u309F\u30A0-\u30FF\s]+$/g, '').trim();
        if (cleanText.length > 0) return cleanText.toLowerCase();
    }
    throw new Error('Çeviri boş döndü.');
}

// Açıklama oluşturma
async function generateDescription(word, langCode) {
    const langName = langMap[langCode] || 'English'; 
    const prompt = `"${word}" kelimesi için ${langName} dilinde, basit, tek bir cümleden oluşan ve bir çocuğun anlayabileceği bir açıklama yaz. Sadece ve sadece açıklamayı içeren tek bir cümle döndür.`;
    const payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 512 } };

    const result = await fetchWithRetry(textApiUrlBase, payload);
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text && text.trim().length > 0) return text.trim();
    throw new Error('Açıklama boş döndü.');
}

// Resim oluşturma
async function generateImage(word, langCode) { 
    const langName = langMap[langCode] || 'English';
    const prompt = `A simple, clear, child-friendly clipart-style illustration for the ${langName} word: "${word}". Focus on the concept described by the word.`; 
    const payload = { instances: [{ prompt: prompt }], parameters: { "sampleCount": 1} };

    const result = await fetchWithRetry(nanoBananaApiUrlBase, payload);
    const base64Data = result?.predictions?.[0]?.bytesBase64Encoded;
    if (base64Data) return `data:image/png;base64,${base64Data}`;
    throw new Error('Resim verisi alınamadı.');
}

// UI Fonksiyonları
function hideResult() {
    resultCard.classList.remove('visible');
    translationOverlay.classList.add('hidden');
    headerSpeakBtn.classList.add('hidden');
    // Not: İçeriği hemen silmiyoruz, yeni içerik gelince değişecek.
}

function showMessage(message, type = 'error') {
    messageBox.innerHTML = message; // HTML desteği
    messageBox.classList.remove('hidden');
    
    // Stil temizle
    messageBox.classList.remove('text-red-600', 'bg-red-100', 'border-red-300', 'text-green-600', 'bg-green-100', 'border-green-300', 'text-yellow-700', 'bg-yellow-100', 'border-yellow-300');

    if (type === 'error') {
        messageBox.classList.add('text-red-600', 'bg-red-100', 'border-red-300');
    } else if (type === 'success') {
        messageBox.classList.add('text-green-600', 'bg-green-100', 'border-green-300');
    } else { // warning
        messageBox.classList.add('text-yellow-700', 'bg-yellow-100', 'border-yellow-300');
    }
}

function hideMessage() {
    messageBox.textContent = '';
    messageBox.classList.add('hidden');
}

// ARAMA ANA MANTIĞI
async function performSearch() {
    hideMessage();
    
    const targetLang = languageSelect.value;
    const inputWord = searchInput.value.trim().toLowerCase();
    const targetLangName = langMap[targetLang];

    // --- 1. KONTROL: Kelime girildi mi? ---
    if (!inputWord) {
        showMessage('Lütfen bir kelime girin.', 'warning');
        return;
    }

    // --- 2. KONTROL: API Anahtarı var mı? ---
    if (!apiKey || apiKey === "") {
        showMessage('<strong>⚠️ API Anahtarı Eksik!</strong><br>Lütfen <code>script.js</code> dosyasını açıp <code>const apiKey = "";</code> satırına anahtarınızı yapıştırın.', 'error');
        return;
    }

    searchButton.disabled = true;
    searchButton.textContent = 'Aranıyor... (Metinler alınıyor)';
    hideResult();

    try {
        let finalWord = inputWord;

        // Çeviri İsteği
        if (targetLang !== 'tr') {
            finalWord = await generateTranslation(inputWord, targetLang);
        }
        
        // Açıklama İsteği
        const description = await generateDescription(finalWord, targetLang);
        
        // --- BAŞARILI METİN GELDİ ---
        currentSearchData = { word: inputWord, translation: finalWord, description: description, targetLang: targetLang };

        // UI Güncelleme (Metinler)
        resultWord.textContent = inputWord.toUpperCase();
        resultDescription.textContent = description;
        
        if (targetLang !== 'tr') {
            translationText.textContent = `${finalWord.toUpperCase()} (${targetLangName.toUpperCase()})`;
            translationOverlay.classList.remove('hidden', 'flex');
            translationOverlay.classList.add('flex');
            headerSpeakBtn.classList.add('hidden');
        } else {
            translationOverlay.classList.add('hidden');
            headerSpeakBtn.classList.remove('hidden');
        }

        resultCard.classList.add('visible');
        
        // Resim Süreci
        searchButton.textContent = 'Aranıyor... (Resim oluşturuluyor)';
        resultImage.classList.add('hidden'); 
        imageLoader.classList.remove('hidden'); 

        try {
            const imageUrl = await generateImage(finalWord, targetLang); 
            resultImage.src = imageUrl;
            resultImage.alt = `${finalWord} görseli`;
            resultImage.classList.remove('hidden');
        } catch (imageError) {
            console.error("Resim Hatası:", imageError);
            resultImage.src = 'https://placehold.co/600x400/e0e0e0/b0b0b0?text=Görsel+Servisi+Meşgul';
            resultImage.alt = 'Görsel yüklenemedi.';
            resultImage.classList.remove('hidden');
            showMessage("Metinler başarılı ancak resim oluşturulamadı (Servis yoğun olabilir).", 'warning');
        } finally {
             imageLoader.classList.add('hidden');
        }

    } catch (error) {
        // --- HATA YÖNETİMİ ---
        let errorMsg = "Beklenmeyen bir hata oluştu.";
        
        if (error.message === "API_KEY_MISSING") {
            errorMsg = "<strong>API Anahtarı Bulunamadı!</strong><br>Lütfen script.js dosyasına anahtarınızı eklediğinizden emin olun.";
        } else if (error.message === "API_KEY_INVALID") {
            errorMsg = "<strong>API Anahtarı Geçersiz (Hata 400)!</strong><br>Girdiğiniz anahtarı kontrol edin. Boşluk veya eksik karakter olabilir.";
        } else if (error.message === "API_QUOTA_EXCEEDED") {
            errorMsg = "<strong>Kota Doldu (Hata 429)!</strong><br>Çok fazla istek yaptınız. Lütfen 1-2 dakika bekleyip tekrar deneyin.";
        } else if (error.message === "API_PERMISSION_DENIED") {
            errorMsg = "<strong>Erişim Reddedildi (Hata 403)!</strong><br>API anahtarınızın yetkisi yok veya bölge kısıtlaması var.";
        } else {
            errorMsg = `Hata Detayı: ${error.message}`;
        }
        
        console.error('İşlem Hatası:', error);
        showMessage(errorMsg, 'error');
    
    } finally {
        searchButton.disabled = false;
        searchButton.textContent = 'Ara';
    }
}

// Listenerlar
searchButton.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearch(); });
languageSelect.addEventListener('change', () => { hideMessage(); hideResult(); searchInput.focus(); });
overlaySpeakBtn.addEventListener('click', () => { if(currentSearchData.translation) speakText(currentSearchData.translation, currentSearchData.targetLang, overlaySpeakBtn); });
headerSpeakBtn.addEventListener('click', () => { if(currentSearchData.targetLang === 'tr') speakText(currentSearchData.word, 'tr', headerSpeakBtn); });
descriptionSpeakBtn.addEventListener('click', () => { if(currentSearchData.description) speakText(currentSearchData.description, currentSearchData.targetLang, descriptionSpeakBtn); });

hideResult();
