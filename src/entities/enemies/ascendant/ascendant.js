import { AshDisciple } from '../ashDisciple/disciple.js';

// Tian Lei, the Last Ascendant: the boss of the Skybreak Ring (`?level=ring`).
//
// STUB: until his own kit is built he is the Ash Disciple under his name, so the level loads. His
// class (a Duelist with ASC_KIT: three forms, each its own bar) replaces this whole file.

export class Ascendant extends AshDisciple {
  constructor(game) {
    super(game);
    this.name = 'TIAN LEI, THE LAST ASCENDANT';
  }
}
