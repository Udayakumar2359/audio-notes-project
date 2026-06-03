# MONTHLY PROJECT REPORT – 1 (Part 1: Initial Study & Design)

## 1. STUDENT INFORMATION
*   **Student Name**: Udayakumar (or your name)
*   **UUCMS No.**: [Your UUCMS Number]
*   **Semester**: IV Semester MCA
*   **Project Title**: AudioNotes AI
*   **Project Category**: AI / ML / Web Technology
*   **Guide Name**: [Your Guide's Name]
*   **Reporting Period**: Month – 1
*   **Date of Submission**: [Date]

## 2. PROJECT ABSTRACT / OVERVIEW
*   **Background of the problem**: Students often struggle to take comprehensive notes during fast-paced or multilingual lectures. Important details can be missed, and reviewing raw audio recordings is time-consuming and inefficient.
*   **Need for the proposed solution**: There is a need for an automated system that can accurately transcribe lecture audio (even in multiple languages) and synthesize it into clear, structured academic notes, saving students time and improving learning outcomes.
*   **Domain relevance**: This project falls under Artificial Intelligence and Machine Learning as it utilizes advanced Natural Language Processing (NLP) and Automatic Speech Recognition (ASR) models to process audio and text.
*   **Expected outcome of the project**: A fully functional web application (AudioNotes AI) featuring secure user authentication, audio/YouTube upload capabilities, and an AI pipeline that outputs structured notes in various downloadable formats (txt, docx, pdf).

## 3. PROBLEM IDENTIFICATION & OBJECTIVES

### 3.1 Problem Statement
*   **Existing problem/challenge**: Manual note-taking during lectures is prone to error and omission, especially in bilingual or multilingual classroom environments.
*   **Current limitations**: Existing transcription tools often lack support for mixed-language audio (e.g., Kannada, Hindi, English) and typically provide raw, unstructured text rather than summarized, academic-style notes.
*   **Technical or practical issue addressed**: Bridging the gap between raw Automatic Speech Recognition (ASR) output and readable, study-ready notes using large language models (LLMs) and translation pipelines.
*   **Scope of improvement**: Automating the entire pipeline from audio ingestion (including YouTube links) to the generation of structured, downloadable study materials.

### 3.2 Objectives of the Project
1.  To design and develop a web application for transcribing multilingual lecture audio.
2.  To implement an AI pipeline utilizing Whisper ASR, machine translation, and LLMs (Qwen) for note structuring.
3.  To provide a scalable, secure, and reliable solution using FastAPI and PostgreSQL.
4.  To achieve domain-specific outcomes by allowing users to download generated notes in multiple formats (TXT, PDF, DOCX).

## 4. ACTIVITIES COMPLETED DURING MONTH–1

### 4.1 Requirement Analysis / Initial Study
- [x] Problem identification completed
- [x] Requirement gathering completed
- [x] Existing system study completed
- [x] Literature survey completed
- [x] Technology/domain study completed
- [x] Feasibility study completed

**Brief explanation of completed work:**
During the first month, the core problem of unstructured lecture audio was identified. Requirements for a multilingual ASR system and an NLP summarization pipeline were gathered. A feasibility study confirmed the viability of using open-source models like Whisper and Qwen via a FastAPI backend.

### 4.2 Literature Survey / Existing Work Review

| Sl No | Reference / System / Research | Key Findings |
| :--- | :--- | :--- |
| 1 | OpenAI Whisper ASR | Highly accurate for multilingual transcription but requires post-processing for readability. |
| 2 | Qwen / T5 LLMs | Effective at structuring and summarizing raw text into academic formats when given proper prompts. |
| 3 | Existing Note-taking Apps | Mostly rely on manual input or basic dictation; lack intelligent summarization and YouTube audio extraction. |

### 4.3 Requirement Specifications

**A. Functional Requirements**
*   **FR1**: Secure User Authentication (Email/Password with OTP, Google OAuth).
*   **FR2**: Audio file upload (.wav, .mp3, etc.) and YouTube URL audio extraction.
*   **FR3**: Automated transcription, translation, and structured note generation with export options.

**B. Non-Functional Requirements**
- [x] Performance (Background task processing)
- [x] Security (JWT, Password Hashing)
- [x] Reliability
- [x] Scalability
- [ ] Availability
- [x] Maintainability
- [x] Accuracy (Model evaluation metrics)

### 4.4 Tools, Technologies & Resources Identified
| Component | Details |
| :--- | :--- |
| Programming Language | Python (Backend), JavaScript/TypeScript (Frontend) |
| Framework / Platform | FastAPI, React (Vite) |
| Database / Dataset | PostgreSQL (SQLAlchemy ORM) |
| Software / Libraries | yt-dlp, PyTorch, Transformers |
| AI Models | udayakumar8214/whisper-classroom-kn-hi-en, Helsinki-NLP, Qwen/Qwen2.5-7B-Instruct |
| Development Environment | VS Code, Python Virtual Environment |

### 4.5 Preliminary Design / Analysis Work
- [x] Architecture Diagram
- [x] Database Schema Design (ER Diagram)
- [x] Algorithm / Pipeline Design

**Brief explanation:**
The system architecture was designed with a decoupled frontend (React) and backend (FastAPI). The backend pipeline is structured to receive audio, run it through the Whisper ASR model, pass it to the translation model if necessary, and finally to the Qwen LLM for note structuring. The PostgreSQL database schema was designed to handle Users, AudioFiles, and StructuredNotes.

## 5. CHALLENGES FACED DURING MONTH–1
*   **Domain understanding**: Understanding the intricacies of chaining multiple AI models (ASR -> Translation -> LLM) without significant data loss or latency.
*   **Technology selection**: Selecting the optimal open-source LLM (Qwen2.5-7B) that balances performance and resource requirements for note structuring.
*   **Technical feasibility**: Ensuring that long audio files could be processed without timing out the web requests (resolved by planning for background task processing).

## 6. PROGRESS STATUS
**Approximate Project Completion**: 35%

## 7. PLAN FOR NEXT MONTH
- [x] System/Model Design
- [x] Module Identification
- [x] Database Design
- [x] Prototype Development
- [x] Coding/Implementation Start

## 8. GUIDE OBSERVATIONS / REMARKS
[To be filled by Guide]

---
**Signatures**
*Student Signature*: _________________
*Project Guide Signature*: _________________
*Date*: _________________
