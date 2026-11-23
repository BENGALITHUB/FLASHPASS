export const successResponse = (res, data, status = 200) => {
  return res.status(status).json({
    ok: true,
    data
  });
};

export const errorResponse = (res, message, code = 'BAD_REQUEST', status = 400) => {
  return res.status(status).json({
    ok: false,
    error: {
      code,
      message
    }
  });
};

