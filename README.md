#  AstroProject — Diário de Observação Astronômica

Aplicação web full-stack para astrônomos amadores registrarem observações do céu, acompanharem as condições em tempo real e receberem sugestões do que observar na semana.

> Projeto acadêmico — Análise e Desenvolvimento de Sistemas.

## 1. Problema, nicho e proposta de valor

| | |
|---|---|
| **Problema** | Observações ficam espalhadas em cadernos, fotos e planilhas; é difícil saber se vale a pena observar hoje (nuvens, Lua, posição dos planetas); sem histórico o iniciante não enxerga a própria evolução. |
| **Nicho** | Astrônomos amadores, estudantes e clubes de astronomia (olho nu, binóculo e telescópio de entrada). |
| **Ideia** | Um diário online que une **registro**, **planejamento** e **acompanhamento**. |
| **Proposta de valor** | Saber o que observar hoje, registrar em segundos (com foto, local e equipamento) e ver a evolução em um dashboard. |

## 2. Funcionalidades (MVP)

- **Landing page** pública (`/`) apresentando problema, solução e como funciona.
- **Autenticação** com cadastro/login, senha com bcrypt e sessão por **JWT**.
- **CRUD de observações** com upload de foto, GPS, filtros por objeto e período e paginação.
- **Céu ao vivo**: cobertura de nuvens do seu local via **SSE** (Open-Meteo).
- **Sugestões do dia e da semana**: Sol, Lua e planetas via **NASA JPL Horizons**, cruzados com a previsão e com o seu histórico.
- **Dashboard**: total, objetos únicos, equipamentos mais usados, condições do céu e gráfico mensal.

## 3. Tecnologias

React 19 + Vite · React Router · Axios · Node.js 20 + Express · MongoDB Atlas + Mongoose · JWT · bcryptjs · Multer · Jest + Supertest · ESLint · Docker.

## 4. Estrutura

```
Projeto_Astronomia/
├── backend/            API Express (routes, models, services, middleware, tests)
├── frontend/           React + Vite (pages, components, services, context)
├── docs/               Diagramas (Mermaid + PNG) e documentação Scrum
├── Dockerfile          Imagem única: build do front + API servindo o front
├── docker-compose.yml  Orquestração (Atlas ou MongoDB local)
└── render.yaml         Deploy na nuvem (Render)
```

## 5. Como executar

### Pré-requisitos
Node.js 20+, uma conta no [MongoDB Atlas](https://www.mongodb.com/atlas) (ou Docker para usar Mongo local).

### A) Localhost (sem Docker)

```bash
# 1. dependências
npm run install:all

# 2. variáveis de ambiente
cp backend/env.example backend/.env        # preencha MONGODB_URI e JWT_SECRET
cp frontend/.env.example frontend/.env

# 3. subir front + back juntos
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3000/api  (health: `/api/health`)

> Windows (PowerShell): use `copy` no lugar de `cp`.

### B) Docker

```bash
cp .env.docker.example .env      # preencha JWT_SECRET (e MONGODB_URI se usar Atlas)

# Com MongoDB Atlas
docker compose up --build

# Ou com MongoDB local em container
docker compose --profile local-db up --build
```

Acesse http://localhost:3000 (a API serve o front compilado).

### C) Nuvem (Render)

O arquivo `render.yaml` já define o serviço. Configure `MONGODB_URI` e `FRONTEND_URL` no painel; `JWT_SECRET` é gerado automaticamente.

## 6. API (resumo)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/register` | Cria conta |
| POST | `/api/auth/login` | Login (retorna JWT) |
| GET/PUT | `/api/auth/me` | Perfil do usuário |
| GET | `/api/observations` | Lista com filtros e paginação |
| POST | `/api/observations` | Cria (multipart, foto opcional) |
| GET/PUT/DELETE | `/api/observations/:id` | Detalhe, edição, exclusão |
| GET | `/api/observations/stats` | Estatísticas e gráfico mensal |
| GET | `/api/observations/suggestions` | Sugestões do dia |
| GET | `/api/observations/suggestions/week` | Sugestões da semana |
| GET | `/api/observations/sky-stream` | Céu ao vivo (SSE) |
| GET | `/api/health` | Verificação de saúde |

## 7. Qualidade

```bash
cd backend && npm test        # Jest + Supertest, cobertura mínima 90%
cd backend && npm run lint
cd frontend && npm run lint
```

## 8. Documentação do projeto

- [Modelagem do sistema (diagramas)](docs/MODELAGEM.md)
- [Metodologia ágil — Scrum](docs/SCRUM.md)
- [Mapa de requisitos × entregas](docs/REQUISITOS.md)

## 9. Autor

Bruno Soares Budke — [@BrunoBudke](https://github.com/BrunoBudke)
