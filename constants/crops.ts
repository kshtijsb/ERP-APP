export interface CropVariety {
  id: string;
  name: string;
  advice?: string; // Variety specific initial advice
}

export interface CropConfig {
  id: string;
  name: string;
  varieties: CropVariety[];
}

export const CROPS: CropConfig[] = [
  {
    id: 'strawberry',
    name: 'Strawberry',
    varieties: [
      { id: 'elina', name: 'Elina' },
      { id: 'sweet_sensation', name: 'Sweet Sensation' },
      { id: 'brilliance', name: 'Brilliance' },
      { id: 'm2', name: 'M2' },
      { id: 'parthino', name: 'Parthino' },
      { id: 'milisa', name: 'Milisa' },
      { id: 'cleopatra', name: 'Cleopatra' },
      { id: 'murano', name: 'Murano' },
      { id: 'velocity', name: 'Velocity' },
    ],
  },
  {
    id: 'soyabean',
    name: 'Soyabean',
    varieties: [
      { id: 'js_335', name: 'JS 335' },
      { id: 'js_93_05', name: 'JS 93-05' },
      { id: 'macs_1188', name: 'MACS 1188' },
      { id: 'ks_103', name: 'KS 103' },
    ],
  },
  {
    id: 'peanut',
    name: 'Peanut',
    varieties: [
      { id: 'tag_24', name: 'TAG 24' },
      { id: 'tg_26', name: 'TG 26' },
      { id: 'sb_11', name: 'SB 11' },
      { id: 'phule_pragati', name: 'Phule Pragati' },
    ],
  },
  {
    id: 'tomato',
    name: 'Tomato',
    varieties: [
      { id: 'abhinav', name: 'Abhinav' },
      { id: 'arka_rakshak', name: 'Arka Rakshak' },
      { id: 'pusa_ruby', name: 'Pusa Ruby' },
      { id: 'arka_saurabh', name: 'Arka Saurabh' },
    ],
  },
  {
    id: 'ginger',
    name: 'Ginger',
    varieties: [
      { id: 'mahim', name: 'Mahim' },
      { id: 'rio_de_janeiro', name: 'Rio de Janeiro' },
      { id: 'burdwan', name: 'Burdwan' },
    ],
  },
  {
    id: 'turmeric',
    name: 'Turmeric',
    varieties: [
      { id: 'salem', name: 'Salem' },
      { id: 'sangli', name: 'Sangli' },
      { id: 'krishna', name: 'Krishna' },
      { id: 'tekurpet', name: 'Tekurpet' },
    ],
  },
  {
    id: 'gram',
    name: 'Gram',
    varieties: [
      { id: 'vijay', name: 'Vijay' },
      { id: 'digvijay', name: 'Digvijay' },
      { id: 'vishal', name: 'Vishal' },
      { id: 'jaki_9218', name: 'JAKI 9218' },
    ],
  },
  {
    id: 'cotton',
    name: 'Cotton',
    varieties: [
      { id: 'bt_hybrid', name: 'Bt Hybrid' },
      { id: 'desi', name: 'Desi' },
    ],
  },
  {
    id: 'sugarcane',
    name: 'Sugarcane',
    varieties: [
      { id: 'co_86032', name: 'CO-86032' },
      { id: 'co_0238', name: 'CO-0238' },
    ],
  },
  {
    id: 'grapes',
    name: 'Grapes',
    varieties: [
      { id: 'thompson_seedless', name: 'Thompson Seedless' },
      { id: 'sonaka', name: 'Sonaka' },
      { id: 'manik_chaman', name: 'Manik Chaman' },
    ],
  },
  {
    id: 'chilli',
    name: 'Chilli',
    varieties: [
      { id: 'teja', name: 'Teja' },
      { id: 'guntur_sannam', name: 'Guntur Sannam' },
    ],
  },
];

export const getCropById = (id: string) => CROPS.find(c => c.id === id || c.name.toLowerCase() === id.toLowerCase());

export const getVariety = (cropId: string, varietyId: string) => {
  const crop = getCropById(cropId);
  return crop?.varieties.find(v => v.id === varietyId || v.name.toLowerCase() === varietyId.toLowerCase());
};
