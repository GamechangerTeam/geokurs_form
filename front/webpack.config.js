import webpack from "webpack";
import path from "path";
import { fileURLToPath } from "url";
import HtmlWebpackPlugin from "html-webpack-plugin";
import ReactRefreshWebpackPlugin from "@pmmmwh/react-refresh-webpack-plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = (env, argv) => {
  const isProduction = argv.mode === "production";

  return {
    entry: "./src/index.js",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "bundle.js",
      publicPath: "/",
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          use: {
            loader: "babel-loader",
            options: {
              presets: ["@babel/preset-env", "@babel/preset-react"],
              plugins: !isProduction ? ["react-refresh/babel"] : [],
            },
          },
          exclude: /node_modules/,
        },
        {
          test: /\.css$/i,
          use: ["style-loader", "css-loader", "postcss-loader"],
        },
      ],
    },
    resolve: {
      extensions: [".js", ".jsx"],
    },
    devServer: {
      port: 1000,
      historyApiFallback: true,
      static: {
        directory: path.resolve(__dirname, "dist"),
      },
      setupMiddlewares: (middlewares, devServer) => {
        devServer.app.post("*", (req, res) => {
          res.redirect(req.originalUrl);
        });
        return middlewares;
      },
      hot: true,
      liveReload: false,
      allowedHosts: ["localhost", ".ngrok-free.app"],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: "./public/index.html",
        filename: "index.html",
      }),
      !isProduction && new ReactRefreshWebpackPlugin({ overlay: false }),
    ].filter(Boolean),
    mode: isProduction ? "production" : "development",
    devtool: isProduction ? "source-map" : "inline-source-map",
  };
};

export default config;
