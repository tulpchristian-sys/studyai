# StudyAI — echte full-stack MVP

## Starten
1. Installeer Node.js 20+.
2. Kopieer `.env.example` naar `.env`.
3. Zet `OPENAI_API_KEY` in `.env` voor echte AI.
4. Run `npm start`.
5. Open http://localhost:3000.

## Wat werkt
- Registreren/inloggen
- Persoonlijk profiel
- Dashboard + XP/streak
- Werkplannen
- Materiaal uploaden (PDF/afbeelding/tekst) en opslag
- OpenAI-analyse wanneer API-key aanwezig is
- AI tutor
- AI quiz generator
- AI studieplan generator
- Flashcards + resultaten
- Foutenboek
- Vakken, voortgang, games, grammatica, aardrijkskunde
- Free/GO/PRO demo-upgrade

## Nog nodig voor productie
- Echte Stripe Checkout/webhooks
- Productie database (bijv. Postgres/Supabase)
- Veilige password hashing (Argon2/bcrypt)
- Email verification/reset
- Rate limiting, CSRF/CORS policy, audit logging
- Cloud object storage voor uploads
- echte voice/STT en geavanceerde games
- HTTPS + deployment
