'use strict';
const express = require('express');
const { RotasParadas } = require('../data/RotasParadas');
function criarRotasRouter(repositorio = new RotasParadas()) {
  const router = express.Router();
  router.get('/:sentido', (req,res) => {
    try { res.json(repositorio.obter(req.params.sentido)); }
    catch(e) { res.status(400).json({ erro: e.message }); }
  });
  router.put('/:sentido', (req,res) => {
    try { res.json(repositorio.salvar(req.params.sentido,req.body,req.usuario.login)); }
    catch(e) { res.status(400).json({ erro: e.message }); }
  });
  return router;
}
module.exports = criarRotasRouter;
