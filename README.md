# 🔭 Diário Astronômico

Aplicação full-stack para registrar e organizar suas observações do céu noturno. Com integração à **NASA Horizons** e à **Open-Meteo**, o app sugere quais planetas e astros estarão visíveis na sua região e como estará o céu na semana.

---

## ✨ Funcionalidades

- **Diário de observações** — registre objeto, data, equipamento, condições do céu, localização, notas e foto
- **Dashboard** — estatísticas pessoais, gráfico mensal de sessões, ranking de equipamentos e distribuição de condições
- **Sugestões da semana** — visibilidade de Lua, Mercúrio, Vênus, Marte, Júpiter, Saturno, Urano e Netuno com melhor horário, elevação, azimute e magnitude (via NASA Horizons)
- **Previsão do céu** — cobertura de nuvens, chance de chuva, névoa e tempestade (via Open-Meteo)
- **Céu ao vivo** — widget com atualização em tempo real da cobertura de nuvens via SSE
- **Autenticação** — cadastro e login com JWT

---

## 🛠️ Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + Express |
| Banco de dados | MongoDB Atlas (Mongoose) |
| Autenticação | JWT + bcryptjs |
| Upload de fotos | Multer |
| Frontend | React 19 + Vite |
| Roteamento | React Router v7 |
| HTTP client | Axios |
| APIs externas | NASA JPL Horizons + Open-Meteo |
| Deploy | Render |

---

## 📁 Estrutura do projeto

```
Projeto_Astronomia/
├── backend/
│   ├── config/         # Conexão com o MongoDB
│   ├── middleware/     # Autenticação JWT
│   ├── models/         # User, Observation
│   ├── routes/         # auth, observations
│   ├── services/       # horizonsService, weatherService
│   └── server.js
├── frontend/
│   └── src/
│       ├── components/ # AppHeader, LiveSkyWidget, MonthlyChart, ObservationFormModal
│       ├── context/    # AuthContext
│       ├── hooks/      # useSkyStream
│       ├── pages/      # Login, Register, Observations, Dashboard, Suggestions
│       └── services/   # api, authService, observationService
├── package.json        # Raiz — orquestra backend + frontend com concurrently
└── render.yaml         # Configuração de deploy no Render
```

---

## 🚀 Como rodar localmente

### Pré-requisitos

- Node.js 18+
- Conta no [MongoDB Atlas](https://www.mongodb.com/atlas) (plano gratuito disponível)

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/Projeto_Astronomia.git
cd Projeto_Astronomia
```

### 2. Instale todas as dependências

```bash
npm install          # instala o concurrently na raiz
npm run install:all  # instala dependências do backend e do frontend
```

### 3. Configure as variáveis de ambiente

Crie o arquivo `backend/.env`:

```env
MONGODB_URI=mongodb+srv://<usuario>:<senha>@cluster.mongodb.net/astroproject
JWT_SECRET=sua_chave_secreta_longa_e_aleatoria
JWT_EXPIRES_IN=1h
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

Crie o arquivo `frontend/.env`:

```env
VITE_API_URL=http://localhost:3000/api
```

### 4. Inicie o servidor de desenvolvimento

```bash
npm run dev
```

O terminal exibirá o backend (azul) e o frontend (magenta) rodando em paralelo.

Acesse: **http://localhost:5173**

---

## 📡 Rotas da API

### Auth — `/api/auth`

| Método | Rota | Descrição |
|---|---|---|
| POST | `/register` | Criar conta |
| POST | `/login` | Fazer login |
| GET | `/me` | Dados do usuário logado |
| PUT | `/me` | Atualizar nome ou senha |

### Observações — `/api/observations`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Listar observações (com filtros e paginação) |
| POST | `/` | Criar observação (suporta upload de foto) |
| GET | `/:id` | Buscar observação por ID |
| PUT | `/:id` | Atualizar observação |
| DELETE | `/:id` | Excluir observação |
| GET | `/stats` | Estatísticas e gráfico mensal |
| GET | `/suggestions` | Sugestões para uma data e localização |
| GET | `/suggestions/week` | Sugestões para a semana toda |
| GET | `/sky-stream` | Stream SSE com cobertura de nuvens em tempo real |

---

## ☁️ Deploy no Render

O projeto inclui `render.yaml` configurado para deploy automático.

### Variáveis de ambiente necessárias no Render

| Variável | Valor |
|---|---|
| `MONGODB_URI` | String de conexão do Atlas |
| `JWT_SECRET` | Gerado automaticamente pelo Render |
| `JWT_EXPIRES_IN` | `1h` |
| `FRONTEND_URL` | URL do seu serviço no Render |
| `NODE_ENV` | `production` |

O comando de build (`npm run build`) instala as dependências e gera o bundle do frontend. Em produção, o backend serve os arquivos estáticos do React diretamente.

---

## 🔑 Dicas de segurança

- **Nunca commite o arquivo `.env`** — ele já está no `.gitignore`
- Use um `JWT_SECRET` longo e aleatório. Para gerar um:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- No MongoDB Atlas, em produção restrinja o acesso de rede ao IP do seu servidor (Network Access)

---

## 📄 Licença

MIT