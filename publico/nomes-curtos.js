// Nome curto da tira e dos bloqueios.

const NOMES_CURTOS = {
  LoreEngine: 'Lore Engine',
  _oldSistemaLoreEngine: 'Lore Engine antigo',
  ProjetoConversaComDeus: 'Conversa com Deus',
  'painel-admin': 'Painel + C-3PO',
  'Mapa Khorvaire': 'Khorvaire',
  DiscordTranscriber: 'Transcriber',
  'Corre do Tarado': 'Corre do Tarado',
  'alexa youtube': 'Alexa YT Music',
  PlayerForM3UList: 'Player M3U',
  RagPTdoZero: 'Ragnarok',
};

function nomeCurto(pasta) {
  return NOMES_CURTOS[pasta] ?? null;
}
