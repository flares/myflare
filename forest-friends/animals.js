/* ===================================================================
   Forest Friends — animal dataset
   Plain browser JS. No imports/exports/frameworks.
   Defines window.ANIMALS (array of animal objects) and the helper
   window.animalsByLetter(letter).
   =================================================================== */

var ANIMALS_DATA = [
  // ---------------------------------------------------------------- A
  { key: 'alligator', name: 'Alligator', emoji: '🐊', telugu: 'మొసలి', teluguRoman: 'mosali',
    aliases: ['alligator', 'mosali', 'gator', 'aligator'], sound: 'hiss' },
  { key: 'ant', name: 'Ant', emoji: '🐜', telugu: 'చీమ', teluguRoman: 'cheema',
    aliases: ['ant', 'cheema', 'ants'], sound: 'generic' },
  { key: 'antelope', name: 'Antelope', emoji: '🦌', telugu: 'కృష్ణజింక', teluguRoman: 'krishnajinka',
    aliases: ['antelope', 'krishnajinka', 'blackbuck'], sound: 'generic' },

  // ---------------------------------------------------------------- B
  { key: 'bat', name: 'Bat', emoji: '🦇', telugu: 'గబ్బిలం', teluguRoman: 'gabbilam',
    aliases: ['bat', 'gabbilam'], sound: 'screech' },
  { key: 'bear', name: 'Bear', emoji: '🐻', telugu: 'ఎలుగుబంటి', teluguRoman: 'elugubanti',
    aliases: ['bear', 'teddy', 'elugubanti', 'elugu'], sound: 'growl' },
  { key: 'bee', name: 'Bee', emoji: '🐝', telugu: 'తేనెటీగ', teluguRoman: 'thenetega',
    aliases: ['bee', 'thenetega', 'honeybee'], sound: 'buzz' },
  { key: 'buffalo', name: 'Buffalo', emoji: '🐃', telugu: 'గేదె', teluguRoman: 'gede',
    aliases: ['buffalo', 'gede', 'water buffalo'], sound: 'moo' },

  // ---------------------------------------------------------------- C
  { key: 'camel', name: 'Camel', emoji: '🐪', telugu: 'ఒంటె', teluguRoman: 'onte',
    aliases: ['camel', 'onte'], sound: 'generic' },
  { key: 'cat', name: 'Cat', emoji: '🐈', telugu: 'పిల్లి', teluguRoman: 'pilli',
    aliases: ['cat', 'pilli', 'kitty', 'kitten'], sound: 'meow' },
  { key: 'chicken', name: 'Chicken', emoji: '🐔', telugu: 'కోడి', teluguRoman: 'kodi',
    aliases: ['chicken', 'kodi'], sound: 'cluck' },
  { key: 'cow', name: 'Cow', emoji: '🐄', telugu: 'ఆవు', teluguRoman: 'aavu',
    aliases: ['cow', 'aavu', 'avu'], sound: 'moo' },
  { key: 'crocodile', name: 'Crocodile', emoji: '🐊', telugu: 'మొసలి', teluguRoman: 'mosali',
    aliases: ['crocodile', 'mosali', 'croc'], sound: 'hiss' },

  // ---------------------------------------------------------------- D
  { key: 'deer', name: 'Deer', emoji: '🦌', telugu: 'జింక', teluguRoman: 'jinka',
    aliases: ['deer', 'jinka'], sound: 'bark' },
  { key: 'dog', name: 'Dog', emoji: '🐕', telugu: 'కుక్క', teluguRoman: 'kukka',
    aliases: ['dog', 'kukka', 'puppy', 'doggy'], sound: 'bark' },
  { key: 'dolphin', name: 'Dolphin', emoji: '🐬', telugu: 'డాల్ఫిన్', teluguRoman: 'dolphin',
    aliases: ['dolphin', 'dolfin'], sound: 'click' },
  { key: 'donkey', name: 'Donkey', emoji: '🫏', telugu: 'గాడిద', teluguRoman: 'gaadida',
    aliases: ['donkey', 'gaadida', 'gadida'], sound: 'neigh' },
  { key: 'duck', name: 'Duck', emoji: '🦆', telugu: 'బాతు', teluguRoman: 'baatu',
    aliases: ['duck', 'baatu', 'batu'], sound: 'quack' },

  // ---------------------------------------------------------------- E
  { key: 'eagle', name: 'Eagle', emoji: '🦅', telugu: 'గరుడ', teluguRoman: 'garuda',
    aliases: ['eagle', 'garuda'], sound: 'screech' },
  { key: 'elephant', name: 'Elephant', emoji: '🐘', telugu: 'ఏనుగు', teluguRoman: 'enugu',
    aliases: ['elephant', 'enugu', 'elefant'], sound: 'trumpet' },

  // ---------------------------------------------------------------- F
  { key: 'flamingo', name: 'Flamingo', emoji: '🦩', telugu: 'ఫ్లెమింగో', teluguRoman: 'flamingo',
    aliases: ['flamingo', 'flamingoes'], sound: 'generic' },
  { key: 'fox', name: 'Fox', emoji: '🦊', telugu: 'నక్క', teluguRoman: 'nakka',
    aliases: ['fox', 'nakka'], sound: 'howl' },
  { key: 'frog', name: 'Frog', emoji: '🐸', telugu: 'కప్ప', teluguRoman: 'kappa',
    aliases: ['frog', 'kappa'], sound: 'ribbit' },

  // ---------------------------------------------------------------- G
  { key: 'giraffe', name: 'Giraffe', emoji: '🦒', telugu: 'జిరాఫీ', teluguRoman: 'jiraffee',
    aliases: ['giraffe', 'jiraffee', 'giraf'], sound: 'generic' },
  { key: 'goat', name: 'Goat', emoji: '🐐', telugu: 'మేక', teluguRoman: 'meka',
    aliases: ['goat', 'meka'], sound: 'baa' },
  { key: 'goose', name: 'Goose', emoji: '🪿', telugu: 'హంస', teluguRoman: 'hamsa',
    aliases: ['goose', 'hamsa', 'geese'], sound: 'hiss' },
  { key: 'gorilla', name: 'Gorilla', emoji: '🦍', telugu: 'గొరిల్లా', teluguRoman: 'gorilla',
    aliases: ['gorilla', 'gorila'], sound: 'roar' },

  // ---------------------------------------------------------------- H
  { key: 'hedgehog', name: 'Hedgehog', emoji: '🦔', telugu: 'ముళ్లపంది', teluguRoman: 'mullapandi',
    aliases: ['hedgehog', 'mullapandi', 'hedge hog'], sound: 'squeak' },
  { key: 'hen', name: 'Hen', emoji: '🐔', telugu: 'ఆడకోడి', teluguRoman: 'aadakodi',
    aliases: ['hen', 'aadakodi'], sound: 'cluck' },
  { key: 'hippopotamus', name: 'Hippopotamus', emoji: '🦛', telugu: 'హిప్పోపొటామస్', teluguRoman: 'hippopotamas',
    aliases: ['hippopotamus', 'hippo', 'hippopotamas'], sound: 'growl' },
  { key: 'horse', name: 'Horse', emoji: '🐎', telugu: 'గుర్రం', teluguRoman: 'gurram',
    aliases: ['horse', 'gurram'], sound: 'neigh' },

  // ---------------------------------------------------------------- I
  { key: 'iguana', name: 'Iguana', emoji: '🦎', telugu: 'ఇగువానా', teluguRoman: 'iguana',
    aliases: ['iguana', 'iguna'], sound: 'hiss' },
  { key: 'impala', name: 'Impala', emoji: '🦌', telugu: 'ఇంపాలా', teluguRoman: 'impala',
    aliases: ['impala'], sound: 'generic' },

  // ---------------------------------------------------------------- J
  { key: 'jaguar', name: 'Jaguar', emoji: '🐆', telugu: 'జాగ్వార్', teluguRoman: 'jaguar',
    aliases: ['jaguar', 'jagwar'], sound: 'roar' },
  { key: 'jellyfish', name: 'Jellyfish', emoji: '🪼', telugu: 'జెల్లీ ఫిష్', teluguRoman: 'jellyfish',
    aliases: ['jellyfish', 'jelly fish'], sound: 'generic' },

  // ---------------------------------------------------------------- K
  { key: 'kangaroo', name: 'Kangaroo', emoji: '🦘', telugu: 'కంగారూ', teluguRoman: 'kangaroo',
    aliases: ['kangaroo', 'kanga'], sound: 'generic' },
  { key: 'koala', name: 'Koala', emoji: '🐨', telugu: 'కోఆలా', teluguRoman: 'koala',
    aliases: ['koala', 'koalabear'], sound: 'growl' },

  // ---------------------------------------------------------------- L
  { key: 'leopard', name: 'Leopard', emoji: '🐆', telugu: 'చిరుత', teluguRoman: 'chiruta',
    aliases: ['leopard', 'chiruta'], sound: 'growl' },
  { key: 'lion', name: 'Lion', emoji: '🦁', telugu: 'సింహం', teluguRoman: 'simham',
    aliases: ['lion', 'simham'], sound: 'roar' },
  { key: 'llama', name: 'Llama', emoji: '🦙', telugu: 'లామా', teluguRoman: 'lama',
    aliases: ['llama', 'lama', 'alpaca'], sound: 'generic' },

  // ---------------------------------------------------------------- M
  { key: 'monkey', name: 'Monkey', emoji: '🐒', telugu: 'కోతి', teluguRoman: 'koti',
    aliases: ['monkey', 'koti'], sound: 'screech' },
  { key: 'moose', name: 'Moose', emoji: '🫎', telugu: 'మూస్', teluguRoman: 'moose',
    aliases: ['moose', 'mus'], sound: 'generic' },
  { key: 'mouse', name: 'Mouse', emoji: '🐁', telugu: 'ఎలుక', teluguRoman: 'eluka',
    aliases: ['mouse', 'eluka'], sound: 'squeak' },

  // ---------------------------------------------------------------- N
  { key: 'newt', name: 'Newt', emoji: '🦎', telugu: 'న్యూట్', teluguRoman: 'newt',
    aliases: ['newt'], sound: 'generic' },
  { key: 'nightingale', name: 'Nightingale', emoji: '🐦', telugu: 'కోకిల', teluguRoman: 'kokila',
    aliases: ['nightingale', 'kokila', 'koel'], sound: 'tweet' },

  // ---------------------------------------------------------------- O
  { key: 'ostrich', name: 'Ostrich', emoji: '🦤', telugu: 'ఉష్ట్రపక్షి', teluguRoman: 'ushtrapakshi',
    aliases: ['ostrich', 'ushtrapakshi'], sound: 'generic' },
  { key: 'otter', name: 'Otter', emoji: '🦦', telugu: 'నీటికుక్క', teluguRoman: 'neetikukka',
    aliases: ['otter', 'neetikukka'], sound: 'squeak' },
  { key: 'owl', name: 'Owl', emoji: '🦉', telugu: 'గుడ్లగూబ', teluguRoman: 'gudlagooba',
    aliases: ['owl', 'gudlagooba'], sound: 'hoot' },

  // ---------------------------------------------------------------- P
  { key: 'panda', name: 'Panda', emoji: '🐼', telugu: 'పాండా', teluguRoman: 'panda',
    aliases: ['panda'], sound: 'growl' },
  { key: 'parrot', name: 'Parrot', emoji: '🦜', telugu: 'చిలుక', teluguRoman: 'chiluka',
    aliases: ['parrot', 'chiluka'], sound: 'chirp' },
  { key: 'penguin', name: 'Penguin', emoji: '🐧', telugu: 'పెంగ్విన్', teluguRoman: 'penguin',
    aliases: ['penguin', 'pengwin'], sound: 'screech' },
  { key: 'pig', name: 'Pig', emoji: '🐖', telugu: 'పంది', teluguRoman: 'pandi',
    aliases: ['pig', 'pandi', 'piggy'], sound: 'oink' },

  // ---------------------------------------------------------------- Q
  { key: 'quail', name: 'Quail', emoji: '🐦', telugu: 'లావుపిట్ట', teluguRoman: 'laavupitta',
    aliases: ['quail', 'laavupitta'], sound: 'chirp' },
  { key: 'quokka', name: 'Quokka', emoji: '🦘', telugu: 'క్వొక్కా', teluguRoman: 'quokka',
    aliases: ['quokka', 'kwokka'], sound: 'generic' },

  // ---------------------------------------------------------------- R
  { key: 'rabbit', name: 'Rabbit', emoji: '🐇', telugu: 'కుందేలు', teluguRoman: 'kundelu',
    aliases: ['rabbit', 'kundelu', 'bunny'], sound: 'squeak' },
  { key: 'raccoon', name: 'Raccoon', emoji: '🦝', telugu: 'రకూన్', teluguRoman: 'raccoon',
    aliases: ['raccoon', 'rakoon'], sound: 'growl' },
  { key: 'rooster', name: 'Rooster', emoji: '🐓', telugu: 'కోడిపుంజు', teluguRoman: 'kodipunju',
    aliases: ['rooster', 'kodipunju', 'cockerel'], sound: 'cluck' },

  // ---------------------------------------------------------------- S
  { key: 'sheep', name: 'Sheep', emoji: '🐑', telugu: 'గొర్రె', teluguRoman: 'gorre',
    aliases: ['sheep', 'gorre'], sound: 'baa' },
  { key: 'snake', name: 'Snake', emoji: '🐍', telugu: 'పాము', teluguRoman: 'paamu',
    aliases: ['snake', 'paamu'], sound: 'hiss' },
  { key: 'squirrel', name: 'Squirrel', emoji: '🐿️', telugu: 'ఉడుత', teluguRoman: 'uduta',
    aliases: ['squirrel', 'uduta'], sound: 'chirp' },
  { key: 'swan', name: 'Swan', emoji: '🦢', telugu: 'హంస', teluguRoman: 'hamsa',
    aliases: ['swan', 'hamsa'], sound: 'hiss' },

  // ---------------------------------------------------------------- T
  { key: 'tiger', name: 'Tiger', emoji: '🐅', telugu: 'పులి', teluguRoman: 'puli',
    aliases: ['tiger', 'puli'], sound: 'roar' },
  { key: 'toad', name: 'Toad', emoji: '🐸', telugu: 'కప్ప', teluguRoman: 'kappa',
    aliases: ['toad', 'kappa'], sound: 'ribbit' },
  { key: 'turtle', name: 'Turtle', emoji: '🐢', telugu: 'తాబేలు', teluguRoman: 'taabelu',
    aliases: ['turtle', 'taabelu', 'tortoise'], sound: 'generic' },

  // ---------------------------------------------------------------- U
  { key: 'uakari', name: 'Uakari', emoji: '🐒', telugu: 'ఉకారి', teluguRoman: 'uakari',
    aliases: ['uakari', 'wakari'], sound: 'screech' },
  { key: 'urial', name: 'Urial', emoji: '🐏', telugu: 'ఉరియల్', teluguRoman: 'urial',
    aliases: ['urial'], sound: 'baa' },

  // ---------------------------------------------------------------- V
  { key: 'viper', name: 'Viper', emoji: '🐍', telugu: 'విషసర్పం', teluguRoman: 'vishasarpam',
    aliases: ['viper', 'vishasarpam'], sound: 'hiss' },
  { key: 'vulture', name: 'Vulture', emoji: '🦅', telugu: 'రాబందు', teluguRoman: 'raabandu',
    aliases: ['vulture', 'raabandu'], sound: 'screech' },

  // ---------------------------------------------------------------- W
  { key: 'walrus', name: 'Walrus', emoji: '🦭', telugu: 'వాల్రస్', teluguRoman: 'walrus',
    aliases: ['walrus'], sound: 'growl' },
  { key: 'whale', name: 'Whale', emoji: '🐋', telugu: 'తిమింగలం', teluguRoman: 'timingalam',
    aliases: ['whale', 'timingalam'], sound: 'generic' },
  { key: 'wolf', name: 'Wolf', emoji: '🐺', telugu: 'తోడేలు', teluguRoman: 'todelu',
    aliases: ['wolf', 'todelu'], sound: 'howl' },

  // ---------------------------------------------------------------- X
  { key: 'xerus', name: 'Xerus', emoji: '🐿️', telugu: 'జెరుస్', teluguRoman: 'xerus',
    aliases: ['xerus'], sound: 'chirp' },
  { key: 'xraytetra', name: 'X-ray tetra', emoji: '🐠', telugu: 'ఎక్స్-రే టెట్రా', teluguRoman: 'xraytetra',
    aliases: ['x-ray tetra', 'xray tetra', 'x ray tetra', 'xraytetra'], sound: 'generic' },

  // ---------------------------------------------------------------- Y
  { key: 'yabby', name: 'Yabby', emoji: '🦞', telugu: 'యాబీ', teluguRoman: 'yabby',
    aliases: ['yabby', 'crayfish'], sound: 'generic' },
  { key: 'yak', name: 'Yak', emoji: '🐂', telugu: 'యాక్', teluguRoman: 'yak',
    aliases: ['yak'], sound: 'moo' },

  // ---------------------------------------------------------------- Z
  { key: 'zebra', name: 'Zebra', emoji: '🦓', telugu: 'జీబ్రా', teluguRoman: 'zebra',
    aliases: ['zebra'], sound: 'neigh' },
  { key: 'zebu', name: 'Zebu', emoji: '🐄', telugu: 'జేబూ', teluguRoman: 'zebu',
    aliases: ['zebu', 'brahman cattle'], sound: 'moo' }
];

if (typeof window !== 'undefined') {
  window.ANIMALS = ANIMALS_DATA;

  window.animalsByLetter = function (letter) {
    return window.ANIMALS.filter(function (a) {
      return a.name.replace(/[^a-z]/i, '').charAt(0).toUpperCase() === String(letter).toUpperCase();
    });
  };
}
