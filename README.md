# 🔮 Scenariusze Jutra | Atlantis Analyst

> **Narzędzie analityczne dla MSZ do prognozowania geopolitycznego z wykorzystaniem AI**

<div align="center">

![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_AI-8E75B2?style=for-the-badge&logo=google&logoColor=white)

</div>

---

## 📋 Spis treści

- [**Demo - Gotowa wersja**](#-demo---gotowa-wersja-do-uruchomienia) ⭐
- [**Prezentacja**](#-prezentacja) 📽️
- [O projekcie](#-o-projekcie)
- [Kluczowe funkcje](#-kluczowe-funkcje)
- [Architektura](#-architektura)
- [Szybki start (pełna wersja)](#-szybki-start-pełna-wersja-z-backendem)
- [Jak używać](#-jak-używać)
- [Struktura projektu](#-struktura-projektu)
- [Potencjał rozwojowy](#-potencjał-rozwojowy)
- [Bezpieczeństwo](#-bezpieczeństwo)

---

## 🎯 O projekcie

**Scenariusze Jutra** to prototyp skalowalnego narzędzia analitycznego stworzonego dla Ministerstwa Spraw Zagranicznych RP. Wykorzystuje zaawansowane technologie NLP, analizy danych i modelowania scenariuszy do typowania prawdopodobnych wydarzeń i trendów w polityce międzynarodowej.

### Wyzwanie

Światowa polityka zmienia się coraz szybciej, a tradycyjne metody analizy nie nadążają za wolumenem danych. Pracownicy MSZ spędzają tysiące godzin rocznie na:
- Przetwarzaniu informacji z setek źródeł
- Ustalaniu związków przyczynowo-skutkowych
- Formułowaniu scenariuszy i rekomendacji

### Rozwiązanie

Narzędzie automatyzuje i wspomaga proces analizy foresightowej poprzez:
- **Automatyczne zbieranie danych** z oficjalnych źródeł (ministerstwa, think tanki, instytucje międzynarodowe)
- **Inteligentną syntezę** informacji z zachowaniem pełnej ścieżki cytowań
- **Generowanie scenariuszy** w 4 wariantach (12/36 miesięcy × pozytywny/negatywny)
- **Wyjaśnialność (XAI)** - pełna transparentność ścieżki wnioskowania

---

## ✨ Kluczowe funkcje

### 1. 📊 Generowanie tematów badawczych
- AI analizuje profil kraju i opis sytuacji międzynarodowej
- Generuje 20-30 tematów z wagami istotności (1-100)
- Każdy temat powiązany z czynnikiem sytuacyjnym (a/b/c/d/e/f)

### 2. 🔍 Zbieranie źródeł (Deep Research)
- Automatyczne przeszukiwanie stron rządowych 8 krajów:
  - USA, Niemcy, Francja, UK, Rosja, Chiny, Indie, Arabia Saudyjska
- Instytucje międzynarodowe: NATO, UE, ONZ, OECD, think tanki
- Generowanie zapytań wyszukiwania dla każdego tematu

### 3. 📝 Synteza tematów z cytowaniami
- Agregacja informacji z wielu krajów
- System cytowań: `[Country-N]` np. `[Germany-1]`, `[USA-3]`
- Wykrywanie i oznaczanie źródeł potencjalnie stronniczych (Rosja, Chiny)

### 4. 🎭 Generowanie scenariuszy
4 scenariusze dla państwa Atlantis:
| Perspektywa | Wariant pozytywny | Wariant negatywny |
|-------------|-------------------|-------------------|
| 12 miesięcy | ✅ Optymistyczny | ⚠️ Pesymistyczny |
| 36 miesięcy | ✅ Długoterminowy pozytywny | ⚠️ Długoterminowy negatywny |

### 5. 🧬 AlphaEvolve - Ewolucja jakości
Inspirowane podejściem AlphaEvolve (DeepMind):
- **5 iteracji** ulepszania każdego output'u
- **Ocena 4-wymiarowa** (0-150 punktów):
  - `hall` (0-50): Halucynacje - czy są wymyślone fakty?
  - `cite` (0-35): Cytowania - format i gęstość
  - `bias` (0-35): Stronniczość źródeł
  - `qual` (0-30): Jakość merytoryczna
- **Automatyczne poprawianie** na podstawie feedbacku

### 6. 🔙 Backcasting (Prognozowanie wsteczne)
Alternatywna metoda analityczna:
- Definiowanie pożądanego stanu przyszłego (np. rok 2028)
- Cofanie się krok po kroku do stanu obecnego
- Identyfikacja kamieni milowych i działań krytycznych
- Ocena wykonalności (0-100%)

### 7. 🛤️ Ścieżka wnioskowania (Chain of Thought)
Pełna transparentność procesu analitycznego:
```
FAKT [USER-a] GPU shortage 60% → WNIOSEK: AI infrastructure delayed
   ↓ (waga: 30, pewność: wysoka)
FAKT [Germany-T3-1] EV production down → WNIOSEK: Supply chain risk
   ↓ (waga: 15, pewność: średnia)
→ SCENARIUSZ: Economic slowdown affects Atlantis exports
```

---

## 🏗️ Architektura

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ InputForm   │  │ TopicGrid   │  │ ScenarioReport          │  │
│  │ (profil,    │  │ (wybór      │  │ (4 scenariusze,         │  │
│  │  sytuacja)  │  │  tematów)   │  │  rekomendacje)          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ReasoningPath - wizualizacja ścieżki wnioskowania          ││
│  │ BackcastView - analiza wsteczna                            ││
│  │ EvolutionHistory - historia ewolucji jakości               ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │ REST API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       BACKEND (FastAPI)                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                      Routes Layer                           ││
│  │  /api/sessions  /api/analysis  /api/topics  /api/articles  ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                     Services Layer                          ││
│  │  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  ││
│  │  │ gemini   │  │ evolution │  │ scraper  │  │ sources   │  ││
│  │  │ (LLM)    │  │ (quality) │  │ (web)    │  │ (search)  │  ││
│  │  └──────────┘  └───────────┘  └──────────┘  └───────────┘  ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Data Layer (SQLite)                      │ │
│  │  AnalysisSession → Topic → Scenario → ArticleSummary       │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     EXTERNAL SERVICES                            │
│  ┌──────────────────┐         ┌──────────────────────────────┐  │
│  │ Google Gemini AI │         │ Serper API (Google Search)   │  │
│  │ gemini-2.5-flash │         │ Web scraping                 │  │
│  └──────────────────┘         └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Przepływ danych

```
1. INPUT
   ├── Profil kraju Atlantis (28M ludności, NATO/UE, przemysł)
   ├── Opis sytuacji (a-f z wagami istotności)
   └── Kryterium sukcesu ("interes państwa Atlantis")
         │
         ▼
2. TOPIC GENERATION
   └── Gemini generuje 20-30 tematów badawczych
         │
         ▼
3. SOURCE COLLECTION
   ├── Generowanie zapytań wyszukiwania
   ├── Pobieranie URL z wyszukiwarek (Serper API)
   └── Scraping treści artykułów
         │
         ▼
4. SYNTHESIS
   ├── Podsumowanie per kraj z cytowaniami [Country-N]
   ├── Synteza krzyżowa tematów
   └── AlphaEvolve: 5 iteracji poprawy jakości
         │
         ▼
5. SCENARIO GENERATION
   ├── 4 scenariusze (12/36m × +/-)
   ├── Reasoning steps (fakt → wnioski → wpływ)
   └── Rekomendacje dla Atlantis
         │
         ▼
6. OUTPUT
   ├── Raport 2000-3000 słów
   ├── Ścieżka wnioskowania (Chain of Thought)
   └── Pełna atrybucja źródeł
```

---

## 🎮 Demo - Gotowa wersja do uruchomienia

> ⚡ **Chcesz tylko zobaczyć jak to działa? Użyj gotowego release!**

W folderze znajduje się plik **`Atlantis-Analyst-Demo.zip`** - to w pełni działająca wersja demo z przykładowo wygenerowaną analizą (bez potrzeby kluczy API, backendu, itp.)

### Jak uruchomić demo:

1. **Zainstaluj Node.js** - https://nodejs.org (wersja LTS)
2. **Rozpakuj** `Atlantis-Analyst-Demo.zip`
3. **Uruchom:**
   - **Windows:** kliknij dwukrotnie `START-Windows.bat`
   - **Mac/Linux:** uruchom `./START-Mac-Linux.sh`
4. **Otwórz przeglądarkę:** http://localhost:8080

To jest bezpieczna wersja z zapisanymi danymi (mock data) - nie wymaga połączenia z internetem ani żadnych kluczy API. Działa na każdym komputerze z Node.js.

> 📌 **Jak przeglądać demo:** W wersji demo **nie działa generowanie nowych analiz** - to wymaga backendu i kluczy API. Aby zobaczyć funkcjonalność aplikacji:
> 1. Kliknij na **istniejącą sesję analizy** na liście
> 2. Przeglądaj wygenerowane **tematy, scenariusze i źródła**
> 3. Sprawdź **ścieżkę wnioskowania** i **historię ewolucji jakości**

> ⚠️ **Uwaga:** Pełna wersja z backendem (poniżej) może wymagać dodatkowej konfiguracji. Jeśli masz problemy z uruchomieniem pełnej wersji, użyj wersji demo powyżej - ta na pewno zadziała!

---

## 📽️ Prezentacja

W repozytorium znajduje się plik **`Prezentacja.pdf`** - prezentacja projektu zawierająca opis koncepcji, architektury i funkcjonalności narzędzia.

---

## 🚀 Szybki start (pełna wersja z backendem)

### Wymagania

- **Python** 3.12+
- **Node.js** 20+
- **uv** (Python package manager) - `pip install uv`
- **pnpm** (Node package manager) - `npm install -g pnpm`

### Klucze API

Utwórz plik `backend/.env`:

```env
# Google Gemini API - https://aistudio.google.com/
GEMINI_API_KEY=your_gemini_api_key_here

# Serper API (opcjonalne, do wyszukiwania) - https://serper.dev/
SERPER_API_KEY=your_serper_api_key_here
```

### Instalacja

```bash
# 1. Klonowanie repozytorium
git clone https://github.com/your-org/scenariusze-jutra.git
cd scenariusze-jutra

# 2. Backend
cd backend
uv sync
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 3. Frontend (w nowym terminalu)
cd frontend
pnpm install
```

### Uruchomienie

```bash
# Terminal 1 - Backend (port 8000)
cd backend
uv run uvicorn app.main:app --reload

# Terminal 2 - Frontend (port 5173)
cd frontend
pnpm dev
```

Otwórz http://localhost:5173 w przeglądarce.

---

## 📖 Jak używać

### 1. Nowa sesja analizy

1. Kliknij **"Nowa analiza"**
2. Wypełnij/zmodyfikuj **profil kraju Atlantis**
3. Wprowadź **opis sytuacji międzynarodowej** z wagami (a-f)
4. Wybierz tryb: **Forecast** (prognoza) lub **Backcast** (analiza wsteczna)
5. Kliknij **"Generuj tematy"**

### 2. Wybór tematów

1. Przejrzyj wygenerowane tematy (20-30)
2. Zaznacz tematy istotne dla analizy
3. Opcjonalnie: modyfikuj wagi tematów
4. Kliknij **"Analizuj wybrane"**

### 3. Pobieranie źródeł

1. System generuje zapytania dla źródeł rządowych
2. Kliknij **"Pobierz artykuły"** by scrape'ować treści
3. Poczekaj na syntezę (może potrwać kilka minut)

### 4. Generowanie scenariuszy

1. System generuje 4 scenariusze automatycznie
2. Każdy scenariusz przechodzi przez **AlphaEvolve** (5 iteracji)
3. Przeglądaj **ścieżkę wnioskowania** dla transparentności
4. Eksportuj raport do formatu tekstowego

### 5. Modyfikacja wag

Możesz "ręcznie" modyfikować:
- Wagi tematów (1-100)
- Priorytety czynników sytuacyjnych
- Poziom "temperatury" LLM (realizm vs kreatywność)

---

## 📁 Struktura projektu

```
scenariusze-jutra/
├── backend/                    # Python FastAPI
│   ├── app/
│   │   ├── main.py            # Entry point
│   │   ├── config.py          # Konfiguracja (API keys)
│   │   ├── db.py              # SQLite connection
│   │   ├── models/
│   │   │   └── analysis.py    # SQLModel schemas
│   │   ├── routes/
│   │   │   ├── analysis.py    # Główne endpointy API
│   │   │   ├── articles.py    # Artykuły/scraping
│   │   │   └── health.py      # Health checks
│   │   └── services/
│   │       ├── gemini.py      # Gemini AI integration
│   │       ├── evolution.py   # AlphaEvolve quality loop
│   │       ├── scraper.py     # Web scraping
│   │       ├── sources.py     # Source generation
│   │       └── article_processor.py  # Article processing
│   ├── pyproject.toml
│   └── .env                   # API keys (nie commitować!)
│
├── frontend/                   # React + TypeScript
│   ├── src/
│   │   ├── App.tsx            # Router
│   │   ├── api/               # API client
│   │   ├── components/
│   │   │   ├── InputForm.tsx       # Formularz wejściowy
│   │   │   ├── TopicGrid.tsx       # Siatka tematów
│   │   │   ├── ScenarioReport.tsx  # Raport scenariuszy
│   │   │   ├── ReasoningPath.tsx   # Ścieżka wnioskowania
│   │   │   ├── BackcastView.tsx    # Widok backcasting
│   │   │   └── EvolutionHistory.tsx # Historia ewolucji
│   │   ├── pages/
│   │   │   ├── sessions.tsx        # Lista sesji
│   │   │   ├── session-detail.tsx  # Szczegóły sesji
│   │   │   ├── new-session.tsx     # Nowa analiza
│   │   │   └── topic-detail.tsx    # Szczegóły tematu
│   │   └── types/
│   │       └── analysis.ts    # TypeScript types
│   ├── package.json
│   └── vite.config.ts
│
└── README.md
```

---

## 🔧 Potencjał rozwojowy

Narzędzie zaprojektowano z myślą o skalowalności:

### Planowane rozszerzenia

| Funkcja | Wersja podstawowa | Wersja rozszerzona |
|---------|-------------------|-------------------|
| **Wolumen danych** | 50M słów | 5 miliardów słów |
| **Kraje** | 8 | 50 krajów |
| **Języki** | EN, PL | 30 języków |
| **Formaty** | Tekst | +PDF, MP3, MP4, obrazy |
| **Źródła** | Internet | +kontenery offline |

### Roadmapa techniczna

```
v1.0 (Hackathon)
├── ✅ Generowanie tematów
├── ✅ Zbieranie źródeł (8 krajów)
├── ✅ Synteza z cytowaniami
├── ✅ 4 scenariusze forecast
├── ✅ Backcasting
└── ✅ AlphaEvolve quality loop

v2.0 (3 miesiące)
├── 🔲 Wielojęzyczna analiza (30 języków)
├── 🔲 Rozbudowane scraping (50 krajów)
├── 🔲 PDF/audio/video processing
└── 🔲 Pamięć 10 ostatnich promptów

v3.0 (6 miesięcy)
├── 🔲 Kontenery offline (air-gapped)
├── 🔲 Data poisoning detection
├── 🔲 Custom LLM integration
└── 🔲 5 miliardów słów/operację
```

---

## 🔒 Bezpieczeństwo

### Architektura bezpieczeństwa

```
┌─────────────────────────────────────────┐
│           WARSTWA PUBLICZNA             │
│  (Brak dostępu do promptów/wyników)     │
└─────────────────────────────────────────┘
                    │ 🔒 Auth
                    ▼
┌─────────────────────────────────────────┐
│         DOMENA MSZ (Zalogowani)         │
│  ├── Prompty                            │
│  ├── Wyniki analiz                      │
│  └── Historia sesji                     │
└─────────────────────────────────────────┘
                    │ 🔒 Encrypted
                    ▼
┌─────────────────────────────────────────┐
│            CHMURA (Gemini API)          │
│  ├── Zapytania szyfrowane               │
│  └── Brak retencji danych               │
└─────────────────────────────────────────┘
```

### Zasady bezpieczeństwa

1. **Izolacja promptów** - żaden użytkownik spoza domeny MSZ nie ma dostępu
2. **Szyfrowanie w tranzycie** - HTTPS dla wszystkich połączeń
3. **Brak retencji w chmurze** - Gemini API nie przechowuje zapytań
4. **Audyt źródeł** - pełna atrybucja każdej informacji
5. **Wykrywanie bias** - automatyczne oznaczanie źródeł potencjalnie stronniczych

### Przyszłe funkcje bezpieczeństwa

- 🔲 **Data Poisoning Detection** - wykrywanie celowo zanieczyszczonych danych
- 🔲 **Air-gapped deployment** - praca bez połączenia z internetem publicznym
- 🔲 **HSM integration** - sprzętowe zarządzanie kluczami

---

## 📊 Przykładowy output

### Scenariusz 12 miesięcy (pozytywny)

> W perspektywie 12 miesięcy Atlantis może wykorzystać obecną sytuację geopolityczną do wzmocnienia swojej pozycji [USER-a]. Według danych niemieckiego Ministerstwa Gospodarki [Germany-T3-1], europejski przemysł motoryzacyjny rozpoczął restrukturyzację, co otwiera możliwości dla producentów z Atlantis [Germany-T3-2]. 
>
> Jednocześnie, inwestycje USA w ukraiński przemysł wydobywczy [USER-e] tworzą potencjał dla firm z Atlantis jako partnerów logistycznych. Rosja twierdzi [Russia-T5-1], że sankcje są nieskuteczne, jednak dane OECD [OECD-T7-2] wskazują na 15% spadek rosyjskiego eksportu energetycznego.

### Ścieżka wnioskowania

| Fakt | Waga | Wniosek | Wpływ | Pewność |
|------|------|---------|-------|---------|
| [USER-a] GPU shortage 60% | 30 | Opóźnienia w AI infrastructure | ⚠️ Negatywny | Wysoka |
| [Germany-T3-1] EV production -30% | 15 | Szansa dla motoryzacji Atlantis | ✅ Pozytywny | Średnia |
| [USER-f] Oil prices 30-35 USD | 25 | Osłabienie budżetu Rosji | ✅ Pozytywny | Wysoka |

---

## 👥 Zespół

Projekt stworzony na hackathon Ministerstwa Spraw Zagranicznych RP "Scenariusze jutra" 2025.

---

## 📄 Licencja

Projekt wykorzystuje wyłącznie licencje bezpłatne zgodnie z wymaganiami wyzwania.

---

<div align="center">

**🇵🇱 Ministerstwo Spraw Zagranicznych RP**

*"Scenariusze jutra" - bo przyszłość można przewidzieć*

</div>
