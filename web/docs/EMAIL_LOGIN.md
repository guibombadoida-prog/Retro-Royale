# Login por código de e-mail

O jogador informa o Gmail ou e-mail, recebe seis números e confirma o código no próprio jogo. O site e o Android usam a mesma conta e o mesmo progresso.

## Ativar o envio

Cadastre estes dois segredos no GitHub (*Settings → Secrets and variables → Actions*). O workflow "Servidor na Cloudflare" envia os dois para o Worker no próximo deploy:

- `RESEND_API_KEY`: chave de envio da conta Resend do responsável pelo jogo.
- `LOGIN_EMAIL_FROM`: remetente de um domínio verificado, por exemplo `Retro Royale <login@seu-dominio.com>`.

O serviço envia por HTTPS pela API transacional Resend. Verifique o domínio e seus registros DNS antes de habilitar jogadores externos. O remetente de teste `resend.dev` permite apenas destinatários autorizados pelo próprio serviço e não serve como configuração pública do jogo. A chave fica no servidor; o APK e o JavaScript não a recebem.

Sem esses segredos, o formulário informa que o envio ainda não está disponível. O servidor responde 503 e não simula envio ou login. Nenhum serviço de envio real foi configurado durante esta implementação.

Referências oficiais:

- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/knowledge-base/403-error-resend-dev-domain

## Comportamento

O código expira em dez minutos, aceita até cinco tentativas e só pode ser usado uma vez. O reenvio exige sessenta segundos. O servidor limita a cinco envios por e-mail, dez por perfil e vinte por origem a cada hora, incluindo falhas de transporte. Pedidos simultâneos compartilham esses limites. Os aliases de pontos, sufixos `+` e `googlemail.com` de um Gmail identificam a mesma conta.

O banco guarda apenas um hash do código combinado com um segredo aleatório de alta entropia que fica no navegador solicitante. O código não é devolvido pela API nem salvo no armazenamento do navegador. O desafio também é vinculado ao perfil que o solicitou. A sessão usa cookie Secure, HttpOnly e SameSite=Lax por até trinta dias; sair da conta revoga a sessão desse aparelho. O código não concede acesso à caixa de entrada, contatos ou outros serviços do Gmail.

No primeiro acesso confirmado, o jogo copia a progressão de visitante validada pelo servidor para um perfil separado da conta. Outro dispositivo com o mesmo e-mail recupera esse perfil. A conta preserva o baralho já salvo quando recebe o progresso de um novo visitante. As gravações não permitem alterar contagens de batalha ou liberar campeões pelo cliente. Revisões evitam que um aparelho com dados antigos sobrescreva uma gravação mais recente.

O menu também permite copiar um código de recuperação do perfil de visitante. Ele deve ser guardado antes de desinstalar um APK com assinatura diferente. O código de visitante dá acesso àquele perfil e só é mostrado após uma ação explícita. Contas verificadas são recuperadas por um novo código enviado ao e-mail.

## Validação

`node tests/account.test.mjs` executa as rotas reais sobre SQLite com transporte de e-mail simulado. Cobre envio, expiração, tentativas, uso único, limites simultâneos, origem, sessão e sincronização. O teste não confirma entrega em uma caixa de entrada real. Depois da configuração, valide a entrega para Gmail, a pasta de spam e o ciclo de entrada e saída no site e em um Android físico.
