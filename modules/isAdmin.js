const isAdmin = (req) => req.query.key == process.env.REFRESH_KEY;

export default isAdmin;
