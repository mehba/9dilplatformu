// v3.0 Script Dosyası
console.log("Script v3.0 Başlatıldı");

// ==========================================
// LÜTFEN API ANAHTARINIZI BURAYA YAPIŞTIRIN
// ==========================================
const apiKey = "AIzaSyA8o-fmOİrx2Hh8ZhPqPqS6GBM6fco"; 
// ==========================================

const langMap = {'tr': 'Türkçe', 'en': 'English', 'es': 'Español', 'de': 'Deutsch', 'fr': 'Français', 'it': 'Italiano', 'ja': 'Japanese', 'ar': 'Arabic', 'ru': 'Russian'};
const speechLangMap = {'tr': 'tr-TR', 'en': 'en-US', 'es': 'es-ES', 'de': 'de-DE', 'fr': 'fr-FR', 'it': 'it-IT', 'ja': 'ja-JP', 'ar': 'ar-SA', 'ru': 'ru-RU'};

let currentSearchData = {};

const elements = {
    langSelect: document.getElementById('language-select'),
    input: document.getElementById('search-input'),
    btn: document.getElementById('search-button'),
    msgBox: document.getElementById('message-box'),
    card: document.getElementById('result-card'),
    word: document.getElementById('result-word'),
    desc: document.getElementById('result-description'),
    img: document.getElementById('result-image'),
    loader: document.getElementById('image-loader'),
    transOverlay: document.getElementById('translation-overlay'),
    transText: document.getElementById('translation-text'),
    headSpeak: document.getElementById('header-speak-btn'),
    overSpeak: document.getElementById('overlay-speak-btn'),
    descSpeak: document.getElementById('description-speak-btn')
};

// Sesli Okuma
function speak(text, lang, btn) {
    if (!window.speechSynthesis) return alert("Sesli okuma desteklenmiyor.");
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLangMap[lang] || 'en-US';
    u.rate = 0.9;
    if(btn) btn.classList.add('speaking');
    u.onend = () => { if(btn) btn.classList.remove('speaking'); };
    window.speechSynthesis.speak(u);
}

// Güvenli Fetch Fonksiyonu
async function safeFetch(url, payload) {
    // 1. Anahtar Kontrolü
    if (!apiKey || apiKey.length < 5) throw new Error("KEY_MISSING");

    try {
        const response = await fetch(`${url}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // 2. HTTP Hata Kodları Kontrolü
        if (!response.ok) {
            if (response.status === 400) throw new Error("KEY_INVALID");
            if (response.status === 403) throw new Error("PERMISSION_DENIED");
            if (response.status === 429) throw new Error("QUOTA_EXCEEDED");
            throw new Error(`HTTP_${response.status}`);
        }

        // 3. JSON Çözümleme Hatası Kontrolü
        try {
            return await response.json();
        } catch (e) {
            throw new Error("INVALID_JSON_RESPONSE");
        }

    } catch (err) {
        // Network hataları (internet yok vb.)
        if (err.name === 'TypeError' && err.message.includes('fetch')) {
            throw new Error("NETWORK_ERROR");
        }
        throw err;
    }
}

// Metin Üretimi
async function generateText(prompt) {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent";
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const res = await safeFetch(url, payload);
    return res?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

// Resim Üretimi
async function generateImage(prompt) {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict";
    const payload = { instances: [{ prompt }], parameters: { sampleCount: 1 } };
    const res = await safeFetch(url, payload);
    const b64 = res?.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) throw new Error("NO_IMAGE_DATA");
    return `data:image/png;base64,${b64}`;
}

// UI Mesaj
function showMsg(html, type) {
    elements.msgBox.innerHTML = html;
    elements.msgBox.classList.remove('hidden', 'bg-red-100', 'text-red-600', 'border-red-300', 'bg-yellow-100', 'text-yellow-700', 'border-yellow-300');
    if (type === 'error') elements.msgBox.classList.add('bg-red-100', 'text-red-600', 'border-red-300');
    else elements.msgBox.classList.add('bg-yellow-100', 'text-yellow-700', 'border-yellow-300');
}

// Ana Fonksiyon
async function runSearch() {
    elements.msgBox.classList.add('hidden');
    const word = elements.input.value.trim().toLowerCase();
    const targetLang = elements.langSelect.value;
    
    if (!word) return showMsg("Lütfen bir kelime yazın.", 'warn');

    elements.btn.disabled = true;
    elements.btn.innerText = "İşleniyor...";
    
    // Kartı gizle ama tamamen silme
    elements.card.classList.remove('visible');

    try {
        // 1. Çeviri
        let translatedWord = word;
        if (targetLang !== 'tr') {
            const transRes = await generateText(`Translate Turkish word "${word}" to ${langMap[targetLang]}. Output only the word.`);
            if (!transRes) throw new Error("TRANSLATION_FAILED");
            translatedWord = transRes.replace(/[^\w\s\u00C0-\u017F\u0400-\u04FF\u0600-\u06FF\u3000-\u30FF]/g, '').toLowerCase();
        }

        // 2. Açıklama
        const descRes = await generateText(`"${translatedWord}" kelimesi için ${langMap[targetLang]} dilinde, çocuklara uygun tek cümlelik basit bir açıklama yaz. Sadece cümleyi ver.`);
        if (!descRes) throw new Error("DESC_FAILED");

        // UI Güncelle (Metinler)
        elements.word.innerText = word.toUpperCase();
        elements.desc.innerText = descRes;
        
        if (targetLang !== 'tr') {
            elements.transText.innerText = `${translatedWord.toUpperCase()} (${targetLang.toUpperCase()})`;
            elements.transOverlay.classList.remove('hidden');
            elements.transOverlay.classList.add('flex');
            elements.headSpeak.classList.add('hidden');
        } else {
            elements.transOverlay.classList.add('hidden');
            elements.headSpeak.classList.remove('hidden');
        }

        // Verileri Sakla
        currentSearchData = { word, trans: translatedWord, desc: descRes, lang: targetLang };

        // Kartı Göster
        elements.card.classList.add('visible');
        
        // 3. Resim
        elements.btn.innerText = "Resim Oluşturuluyor...";
        elements.img.classList.add('hidden');
        elements.loader.classList.remove('hidden');

        try {
            const imgUrl = await generateImage(`Cute, simple vector clipart of ${translatedWord}, white background, minimalistic style.`);
            elements.img.src = imgUrl;
            elements.img.classList.remove('hidden');
        } catch (imgErr) {
            console.error(imgErr);
            elements.img.src = "https://placehold.co/600x400?text=Gorsel+Servisi+Yogun";
            elements.img.classList.remove('hidden');
            showMsg("Metinler tamam ama resim yüklenemedi. Servis yoğun olabilir.", 'warn');
        } finally {
            elements.loader.classList.add('hidden');
        }

    } catch (err) {
        console.error(err);
        let msg = `Hata Oluştu: ${err.message}`;
        if (err.message === "KEY_MISSING") msg = "<strong>HATA: API Anahtarı Yok!</strong><br>Lütfen script.js dosyasını açıp anahtarı yapıştırın.";
        if (err.message === "KEY_INVALID") msg = "<strong>HATA: Geçersiz API Anahtarı!</strong><br>Anahtarı yanlış kopyalamış olabilirsiniz (400 Hatası).";
        if (err.message === "QUOTA_EXCEEDED") msg = "<strong>HATA: Kota Doldu!</strong><br>Çok fazla deneme yaptınız, lütfen biraz bekleyin (429 Hatası).";
        if (err.message === "NETWORK_ERROR") msg = "<strong>HATA: İnternet Bağlantısı Yok!</strong><br>Google sunucularına ulaşılamıyor.";
        
        showMsg(msg, 'error');
    } finally {
        elements.btn.disabled = false;
        elements.btn.innerText = "Ara";
    }
}

// Event Listeners
elements.btn.onclick = runSearch;
elements.input.onkeypress = (e) => e.key === 'Enter' && runSearch();
elements.langSelect.onchange = () => { elements.msgBox.classList.add('hidden'); elements.input.focus(); };
elements.headSpeak.onclick = () => currentSearchData.lang === 'tr' && speak(currentSearchData.word, 'tr', elements.headSpeak);
elements.overSpeak.onclick = () => currentSearchData.trans && speak(currentSearchData.trans, currentSearchData.lang, elements.overSpeak);
elements.descSpeak.onclick = () => currentSearchData.desc && speak(currentSearchData.desc, currentSearchData.lang, elements.descSpeak);
