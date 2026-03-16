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
    varieties: [],
  },
  {
    id: 'peanut',
    name: 'Peanut',
    varieties: [],
  },
  {
    id: 'tomato',
    name: 'Tomato',
    varieties: [],
  },
  {
    id: 'ginger',
    name: 'Ginger',
    varieties: [],
  },
  {
    id: 'turmeric',
    name: 'Turmeric',
    varieties: [],
  },
  {
    id: 'gram',
    name: 'Gram',
    varieties: [],
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
