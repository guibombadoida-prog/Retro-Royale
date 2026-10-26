# Login por código de e-mail

O jogador informa o Gmail ou e-mail, recebe seis números e confirma o código no próprio jogo. O site e o Android usam a mesma conta e o mesmo progresso.

## Ativar o envio

O código pode sair de dois jeitos. Se os dois estiverem configurados, o Gmail tem prioridade.

### Pelo Gmail do jogo (escolha do dono, grátis)

O Worker manda o código pela conta Gmail do jogo, por SMTP com uma **senha de app** do Google (`web/lib/smtp.ts`: TLS na porta 465 de `smtp.gmail.com`, AUTH PLAIN). Não precisa de domínio. O Gmail aceita cerca de 500 envios por dia, o que sobra para o jogo; os limites por e-mail, perfil e origem abaixo continuam valendo.

1. Use um Gmail **só do jogo** (por exemplo, um novo `retroroyale.jogo@gmail.com`). Os jogadores veem esse endereço como remetente, e a senha de app dá acesso a enviar e-mails por ele.
2. Nessa conta, ligue a **Verificação em duas etapas**: <https://myaccount.google.com/signinoptions/twosv>.
3. Crie a **senha de app**: <https://myaccount.google.com/apppasswords>, nome "Retro Royale", **Criar**. O Google mostra 16 letras (com ou sem espaços, tanto faz). Copie.
4. No GitHub, em *Settings → Secrets and variables → Actions → New repository secret*, crie:
   - `GMAIL_USER`: o endereço do Gmail do jogo.
   - `GMAIL_APP_PASSWORD`: as 16 letras da senha de app.
5. Rode *Actions → Servidor na Cloudflare → Run workflow* (ou faça um merge na `main`). O passo "Publicar o Worker" mostra `Segredos de login enviados: GMAIL_USER, GMAIL_APP_PASSWORD`.

Nunca cole a senha de app em conversa, código ou issue: ela fica só nos segredos do GitHub e do Worker. Se ela vazar, apague-a em <https://myaccount.google.com/apppasswords> e crie outra. Se o envio falhar, os registros do Worker (*Cloudflare → Workers → retro-royale → Logs*) mostram `login_email_failed gmail 535` quando o Google recusa a senha de app; o jogador vê só "Não foi possível enviar o código".

### Pelo Resend (para quem tiver domínio próprio)

- `RESEND_API_KEY`: chave de envio da conta Resend do responsável pelo jogo.
- `LOGIN_EMAIL_FROM`: remetente de um domínio verificado, por exemplo `Retro Royale <login@seu-dominio.com>`.

O remetente de teste `resend.dev` só entrega para o dono da conta Resend e não serve para jogadores. Referências: <https://resend.com/docs/api-reference/emails/send-email> e <https://resend.com/docs/knowledge-base/403-error-resend-dev-domain>.

### Sem nenhum dos dois

O formulário informa que o envio ainda não está disponível. O servidor responde 503 e não simula envio ou login. As chaves e senhas ficam no servidor; o APK e o JavaScript nunca as recebem.

## Comportamento

O código expira em dez minutos, aceita até cinco tentativas e só pode ser usado uma vez. O reenvio exige sessenta segundos. O servidor limita a cinco envios por e-mail, dez por perfil e vinte por origem a cada hora, incluindo falhas de transporte. Pedidos simultâneos compartilham esses limites. Os aliases de pontos, sufixos `+` e `googlemail.com` de um Gmail identificam a mesma conta.

O banco guarda apenas um hash do código combinado com um segredo aleatório de alta entropia que fica no navegador solicitante. O código não é devolvido pela API nem salvo no armazenamento do navegador. O desafio também é vinculado ao perfil que o solicitou. A sessão usa cookie Secure, HttpOnly e SameSite=Lax por até trinta dias; sair da conta revoga a sessão desse aparelho. O código não concede acesso à caixa de entrada, contatos ou outros serviços do Gmail.

No primeiro acesso confirmado, o jogo copia a progressão de visitante validada pelo servidor para um perfil separado da conta. Outro dispositivo com o mesmo e-mail recupera esse perfil. A conta preserva o baralho já salvo quando recebe o progresso de um novo visitante. As gravações não permitem alterar contagens de batalha ou liberar campeões pelo cliente. Revisões evitam que um aparelho com dados antigos sobrescreva uma gravação mais recente.

O menu também permite copiar um código de recuperação do perfil de visitante. Ele deve ser guardado antes de desinstalar um APK com assinatura diferente. O código de visitante dá acesso àquele perfil e só é mostrado após uma ação explícita. Contas verificadas são recuperadas por um novo código enviado ao e-mail.

## Validação

`node tests/account.test.mjs` executa as rotas reais sobre SQLite com transporte de e-mail simulado, e `node tests/gmail.test.mjs` confere a conversa SMTP com um servidor falso (TLS na 465, senha de app, cabeçalhos, código que entra na conta, senha recusada e tempo limite). Cobre envio, expiração, tentativas, uso único, limites simultâneos, origem, sessão e sincronização. O teste não confirma entrega em uma caixa de entrada real. Depois da configuração, valide a entrega para Gmail, a pasta de spam e o ciclo de entrada e saída no site e em um Android físico.
