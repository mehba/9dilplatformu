// --- API Ayarları ---
const apiKey = "AIzaSyA8o-fmOİrx2Hh8ZhPqPqS6GBM6fco"; // Kendi API anahtarınızı buraya ekleyebilirsiniz.
const nanoBananaApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
const textApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

// Dil kodlarını tam isimlere çevirmek için harita
const langMap = {
    'tr': 'Türkçe', 'en': 'English', 'es': 'Español', 'de': 'Deutsch', 
    'fr': 'Français', 'it': 'Italiano', 'ja': 'Japanese', 'ar': 'Arabic', 'ru': 'Russian'
};

// Sesli okuma için dil kodları (SpeechSynthesis)
const speechLangMap = {
    'tr': 'tr-TR',
    'en': 'en-US',
    'es': 'es-ES',
    'de': 'de-DE',
    'fr': 'fr-FR',
    'it': 'it-IT',
    'ja': 'ja-JP',
    'ar': 'ar-SA',
    'ru': 'ru-RU'
};

// --- Veri Durumu ---
let currentSearchData = {
    word: '',
    translation: '',
    description: '',
    targetLang: 'en'
};

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
    if (!window.speechSynthesis) {
        alert("Tarayıcınız sesli okuma özelliğini desteklemiyor.");
        return;
    }
    
    // Varsa mevcut okumayı durdur
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLangMap[langCode] || 'en-US';
    utterance.rate = 0.9; // Biraz yavaş ve anlaşılır

    // Görsel geri bildirim
    if(buttonElement) {
        buttonElement.classList.add('speaking');
        buttonElement.classList.add('text-pink-500'); // Renk değişimi
    }

    utterance.onend = function() {
        if(buttonElement) {
            buttonElement.classList.remove('speaking');
            buttonElement.classList.remove('text-pink-500');
        }
    };

    window.speechSynthesis.speak(utterance);
}

// API çağrıları için yeniden deneme mekanizması (Exponential Backoff)
async function fetchWithRetry(url, options, retries = 3, delay = 1000) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            if (response.status === 429 && retries > 0) {
                await new Promise(res => setTimeout(res, delay));
                return fetchWithRetry(url, options, retries - 1, delay * 2);
            }
            throw new Error(`API Hatası: ${response.statusText} (Kod: ${response.status})`);
        }
        return response.json();
    } catch (error) {
        if (retries > 0) {
            await new Promise(res => setTimeout(res, delay));
            return fetchWithRetry(url, options, retries - 1, delay * 2);
        } else {
            console.error('API çağrısı son denemede de başarısız:', error);
            throw error;
        }
    }
}

// Çeviri oluşturma fonksiyonu
async function generateTranslation(word, targetLangCode) {
    const targetLangName = langMap[targetLangCode] || 'English';
    const prompt = `Translate the Turkish word "${word}" into ${targetLangName}. Return only the translated word, nothing else.`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 20
        }
    };

    const result = await fetchWithRetry(textApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
        let cleanText = text.trim();
        cleanText = cleanText.replace(/^[^a-zA-Z0-9\u0600-\u06FF\u3040-\u309F\u30A0-\u30FF\s]+|[^a-zA-Z0-9\u0600-\u06FF\u3040-\u309F\u30A0-\u30FF\s]+$/g, '').trim();
        if (cleanText.length > 0) return cleanText.toLowerCase();
        throw new Error('Çeviri verisi alınamadı: Boş çıktı.');
    } else {
        throw new Error('Çeviri verisi alınamadı.');
    }
}

// Metin Açıklaması oluşturma fonksiyonu
async function generateDescription(word, langCode) {
    const langName = langMap[langCode] || 'English'; 
    const prompt = `"${word}" kelimesi için ${langName} dilinde, basit, tek bir cümleden oluşan ve bir çocuğun anlayabileceği bir açıklama yaz. Sadece ve sadece açıklamayı içeren tek bir cümle döndür, başka hiçbir ek metin (örn: "Tabii, işte açıklama:") olmasın.`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.3, 
            maxOutputTokens: 512
        }
    };

    const result = await fetchWithRetry(textApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text && text.trim().length > 0) return text.trim();
    throw new Error('Açıklama verisi alınamadı.');
}

// Resim oluşturma fonksiyonu
async function generateImage(word, langCode) { 
    const langName = langMap[langCode] || 'English';
    const prompt = `A simple, clear, child-friendly clipart-style illustration for the ${langName} word: "${word}". Focus on the concept described by the word.`; 

    const payload = { 
        instances: [{ prompt: prompt }], 
        parameters: { "sampleCount": 1} 
    };

    const result = await fetchWithRetry(nanoBananaApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const base64Data = result?.predictions?.[0]?.bytesBase64Encoded;
    if (base64Data) return `data:image/png;base64,${base64Data}`;
    throw new Error('Resim verisi alınamadı.');
}

// Sonuç kartını gizle
function hideResult() {
    resultCard.classList.remove('visible');
    translationOverlay.classList.add('hidden');
    headerSpeakBtn.classList.add('hidden');
    setTimeout(() => {
        if (!resultCard.classList.contains('visible')) {
            resultWord.textContent = '';
            resultImage.src = '';
            resultImage.alt = '';
            resultImage.classList.add('hidden');
            imageLoader.classList.add('hidden');
            resultDescription.textContent = '';
        }
    }, 500);
}

// Mesaj göster
function showMessage(message, isError = true) {
    messageBox.textContent = message;
    messageBox.classList.remove('hidden');
    messageBox.classList.toggle('text-red-600', isError);
    messageBox.classList.toggle('bg-red-100', isError);
    messageBox.classList.toggle('text-green-600', !isError);
    messageBox.classList.toggle('bg-green-100', !isError);
    messageBox.classList.toggle('border-red-300', isError);
    messageBox.classList.toggle('border-green-300', !isError);
}

// Mesajı gizle
function hideMessage() {
    messageBox.textContent = '';
    messageBox.classList.add('hidden');
}

// Arama fonksiyonu
async function performSearch() {
    hideMessage();
    
    const targetLang = languageSelect.value;
    const inputWord = searchInput.value.trim().toLowerCase();
    const targetLangName = langMap[targetLang];

    if (!inputWord) {
        showMessage('Lütfen aramak için bir kelime girin.');
        return;
    }

    searchButton.disabled = true;
    searchButton.textContent = 'Aranıyor... (Çeviri oluşturuluyor)';
    
    // YENİ: Başlangıçta sonucu gizle, ancak süreç içindeki hatalarda gizlemeyeceğiz.
    hideResult();

    try {
        let finalWord = inputWord;

        // 1. Adım: Çeviri
        if (targetLang !== 'tr') {
            finalWord = await generateTranslation(inputWord, targetLang);
            searchButton.textContent = `Aranıyor... (${targetLangName} Açıklama oluşturuluyor)`;
        } else {
            searchButton.textContent = 'Aranıyor... (Açıklama oluşturuluyor)';
        }
        
        // 2. Adım: Açıklama
        const description = await generateDescription(finalWord, targetLang);
        
        // Veriyi kaydet
        currentSearchData = {
            word: inputWord, // Orijinal kelime
            translation: finalWord, // Çevrilen kelime
            description: description,
            targetLang: targetLang
        };

        // 3. Adım: Metni göster ve buton metnini güncelle
        resultWord.textContent = inputWord.toUpperCase();
        resultDescription.textContent = description;
        
        // Çeviri kutusunu güncelle
        if (targetLang !== 'tr') {
            translationText.textContent = `${finalWord.toUpperCase()} (${targetLangName.toUpperCase()})`;
            translationOverlay.classList.remove('hidden');
            translationOverlay.classList.add('flex');
            headerSpeakBtn.classList.add('hidden'); // Çeviri varsa başlık butonunu gizle (veya isteğe bağlı açılabilir)
        } else {
            translationOverlay.classList.add('hidden');
            translationOverlay.classList.remove('flex');
            // Eğer hedef dil Türkçe ise, başlıkta ses butonu göster
            headerSpeakBtn.classList.remove('hidden');
        }

        resultCard.classList.add('visible');
        searchButton.textContent = 'Aranıyor... (Resim oluşturuluyor)';
        
        resultImage.src = ''; 
        resultImage.classList.add('hidden'); 
        imageLoader.classList.remove('hidden'); 

        // 4. Adım: Resim (DÜZELTME: Resim hatasını ayrıca yakala, böylece metin silinmez)
        try {
            const imageUrl = await generateImage(finalWord, targetLang); 
            // Resmi göster
            resultImage.src = imageUrl;
            resultImage.alt = `${finalWord} için görsel`;
            resultImage.classList.remove('hidden');
        } catch (imageError) {
            console.error("Resim oluşturma hatası:", imageError);
            // Resim yerine placeholder göster
            resultImage.src = 'https://placehold.co/600x400/e0e0e0/b0b0b0?text=Görsel+Oluşturulamadı';
            resultImage.alt = 'Görsel yüklenemedi.';
            resultImage.classList.remove('hidden');
            showMessage("Metinler hazır ancak resim oluşturulamadı.", true); // Hafif uyarı
        } finally {
             imageLoader.classList.add('hidden');
        }

    } catch (error) {
        // Genel (Metin/Çeviri) hatası
        const userMessage = error.message.includes("verisi alınamadı") 
            ? `Hata: ${error.message}. Lütfen girdiğiniz kelimeyi kontrol edin veya başka bir kelime deneyin.`
            : 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.';

        console.error('Arama sırasında hata:', error);
        showMessage(userMessage);
        // DÜZELTME: Hata durumunda var olan sonucu gizleme (kullanıcı kısmi sonuç görebilsin)
        // hideResult();  <-- Bu satırı kaldırdık.
    } finally {
        searchButton.disabled = false;
        searchButton.textContent = 'Ara';
    }
}

// --- Olay Dinleyicileri ---
searchButton.addEventListener('click', performSearch);

searchInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') performSearch();
});

languageSelect.addEventListener('change', () => {
    hideMessage();
    hideResult();
    searchInput.focus();
});

// Ses butonları için dinleyiciler
overlaySpeakBtn.addEventListener('click', () => {
    if(currentSearchData.translation) {
        speakText(currentSearchData.translation, currentSearchData.targetLang, overlaySpeakBtn);
    }
});

headerSpeakBtn.addEventListener('click', () => {
    if(currentSearchData.targetLang === 'tr') {
        speakText(currentSearchData.word, 'tr', headerSpeakBtn);
    }
});

descriptionSpeakBtn.addEventListener('click', () => {
    if(currentSearchData.description) {
        speakText(currentSearchData.description, currentSearchData.targetLang, descriptionSpeakBtn);
    }
});

// --- Başlangıç Ayarı ---
hideResult();
