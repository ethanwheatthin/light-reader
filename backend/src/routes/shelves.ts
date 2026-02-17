import { Router, Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../data-source';
import { ShelfEntity, DocumentEntity } from '../entities';
import { toShelfDTO } from '../helpers/dto-mapper';

const router = Router();

function getShelfRepo() {
  return AppDataSource.getRepository(ShelfEntity);
}

/** GET /api/shelves — list all shelves */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const shelves = await getShelfRepo().find({
      relations: ['documents'],
      order: { displayOrder: 'ASC' },
    });
    res.json(shelves.map(toShelfDTO));
  } catch (err) {
    next(err);
  }
});

/** GET /api/shelves/:id — get shelf with documents */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const shelf = await getShelfRepo().findOne({
      where: { id: req.params.id },
      relations: ['documents'],
    });
    if (!shelf) return res.status(404).json({ error: { message: 'Shelf not found' } });
    res.json(toShelfDTO(shelf));
  } catch (err) {
    next(err);
  }
});

/** POST /api/shelves — create new shelf */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const shelfRepo = getShelfRepo();
    const { name, color, order } = req.body;

    // Auto-calculate order if not provided
    let displayOrder = order;
    if (displayOrder === undefined) {
      const count = await shelfRepo.count();
      displayOrder = count;
    }

    const shelf = shelfRepo.create({
      name,
      color,
      displayOrder,
    });
    const saved = await shelfRepo.save(shelf);

    // Reload with documents relation
    const full = await shelfRepo.findOne({
      where: { id: saved.id },
      relations: ['documents'],
    });

    res.status(201).json(toShelfDTO(full!));
  } catch (err) {
    next(err);
  }
});

/** PUT /api/shelves/:id — update shelf */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const shelfRepo = getShelfRepo();
    const shelf = await shelfRepo.findOne({
      where: { id: req.params.id },
      relations: ['documents'],
    });
    if (!shelf) return res.status(404).json({ error: { message: 'Shelf not found' } });

    const { name, color, order } = req.body;
    if (name !== undefined) shelf.name = name;
    if (color !== undefined) shelf.color = color;
    if (order !== undefined) shelf.displayOrder = order;

    await shelfRepo.save(shelf);

    // Reload
    const full = await shelfRepo.findOne({
      where: { id: shelf.id },
      relations: ['documents'],
    });
    res.json(toShelfDTO(full!));
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/shelves/:id — delete shelf (documents become unshelved) */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const shelfRepo = getShelfRepo();
    const shelf = await shelfRepo.findOne({
      where: { id: req.params.id },
      relations: ['documents'],
    });
    if (!shelf) return res.status(404).json({ error: { message: 'Shelf not found' } });

    // The FK ON DELETE SET NULL will handle setting shelf_id to null on documents
    await shelfRepo.remove(shelf);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/** PUT /api/shelves/:id/documents — add/remove documents from shelf */
router.put('/:id/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const shelfRepo = getShelfRepo();
    const shelf = await shelfRepo.findOne({
      where: { id: req.params.id },
      relations: ['documents'],
    });
    if (!shelf) return res.status(404).json({ error: { message: 'Shelf not found' } });

    const { addDocumentIds = [], removeDocumentIds = [] } = req.body;
    const docRepo = AppDataSource.getRepository(DocumentEntity);

    // Remove documents from shelf
    for (const docId of removeDocumentIds) {
      const doc = await docRepo.findOne({ where: { id: docId } });
      if (doc && doc.shelfId === shelf.id) {
        doc.shelfId = null;
        await docRepo.save(doc);
      }
    }

    // Add documents to shelf
    for (const docId of addDocumentIds) {
      const doc = await docRepo.findOne({ where: { id: docId } });
      if (doc) {
        doc.shelfId = shelf.id;
        await docRepo.save(doc);
      }
    }

    // Reload
    const full = await shelfRepo.findOne({
      where: { id: shelf.id },
      relations: ['documents'],
    });
    res.json(toShelfDTO(full!));
  } catch (err) {
    next(err);
  }
});

export default router;
