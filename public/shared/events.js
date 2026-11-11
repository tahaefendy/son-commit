/*
 * Socket.IO olay adları — hem sunucu (require) hem tarayıcı (window.EV) tarafından kullanılır.
 * İsimlendirme: "<kaynak>:<eylem>"
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EV = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return Object.freeze({
    // İstemci -> Sunucu
    C: Object.freeze({
      HOST_HELLO: 'host:hello',
      HOST_START: 'host:start',
      HOST_PAUSE: 'host:pause',
      HOST_RESUME: 'host:resume',
      HOST_RESET: 'host:reset',
      HOST_NEXT: 'host:next',
      HOST_NEXT_QUESTION: 'host:nextQuestion',
      HOST_RESTART_QUESTION: 'host:restartQuestion',
      HOST_LOCK: 'host:lockVotes',
      HOST_SHOW_RESULTS: 'host:showResults',
      PLAYER_JOIN: 'player:join',
      PLAYER_VOTE: 'player:vote',
    }),
    // Sunucu -> İstemci
    S: Object.freeze({
      HOST_READY: 'host:ready',
      HOST_DENIED: 'host:denied',
      STATE_HOST: 'state:host',
      VOTES: 'votes:update',
      PRESENCE: 'presence:update',
      NOTICE: 'host:notice',
      JOINED: 'player:joined',
      JOIN_ERROR: 'player:joinError',
      STATE_PLAYER: 'state:player',
      VOTE_ACK: 'player:voteAck',
      VOTE_REJECTED: 'player:voteRejected',
    }),
  });
});
