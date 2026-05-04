import json
import pickle
import sys

import pandas as pd


def main():
    payload = json.load(sys.stdin)

    with open(payload["modelPath"], "rb") as model_file:
        model = pickle.load(model_file)

    with open(payload["columnsPath"], "r", encoding="utf-8") as columns_file:
        columns = json.load(columns_file)

    features = pd.DataFrame([payload["features"]], columns=columns)
    prediction = int(model.predict(features)[0])
    probability = None

    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(features)[0]
        if len(probabilities) > 1:
            probability = float(probabilities[1])
        else:
            probability = float(probabilities[0])

    print(json.dumps({
        "prediction": prediction,
        "probability": probability
    }))


if __name__ == "__main__":
    main()
