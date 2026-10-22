import { AppError } from '../core/errors.js';

export function validate(schema) {
  return async (req, res, next) => {
    try {
      const dataToValidate = {
        body: req.body,
        query: req.query,
        params: req.params,
      };

      const result = await schema.safeParseAsync(dataToValidate);
      if (!result.success) {
        const fields = result.error.errors.map((err) => ({
          field: err.path.join('.').replace(/^(body|query|params)\./, ''),
          error: err.message,
        }));
        return next(AppError.validation('Validation failed', fields));
      }

      // Assign parsed values back
      if (result.data.body) req.body = result.data.body;
      if (result.data.query) req.query = result.data.query;
      if (result.data.params) req.params = result.data.params;

      next();
    } catch (err) {
      next(err);
    }
  };
}
