import { errorResponse } from '../utils/response.utils.js';

export const validate = (schema) => (req, res, next) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params
    });
    next();
  } catch (err) {
    const errorMsg = err.errors ? err.errors.map(e => e.message).join(', ') : 'Validation failed';
    return errorResponse(res, errorMsg, 'VALIDATION_ERROR', 400);
  }
};

