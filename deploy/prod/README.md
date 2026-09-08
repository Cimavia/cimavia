# Déploiement — object storage des tiers CLOUD (staging, prod)

Ce qui doit être posé **sur le bucket** et que le code ne peut pas poser lui-même. À appliquer au
moment où le bucket Scaleway est créé — d'ici là, ce dossier est la mémoire de l'opération.

## Purge des envois découpés abandonnés

Un envoi découpé (`CreateMultipartUpload`) qui n'est jamais clos laisse ses parts sur le bucket.
Elles sont **facturées** et n'apparaissent pas à `ListObjects` — seulement à
`ListMultipartUploads`. L'app abandonne l'upload dès qu'elle renonce, mais si l'`abort` lui-même
échoue (l'app est tuée, le réseau tombe des deux côtés), personne ne repasse derrière.

`bucket-lifecycle.json` est la règle qui ramasse : tout envoi découpé ouvert depuis plus de
**7 jours** est abandonné par le storage.

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT" \
  --lifecycle-configuration file://deploy/prod/bucket-lifecycle.json

# LA vérification, et elle n'est pas cosmétique (cf. ci-dessous) :
aws s3api get-bucket-lifecycle-configuration --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"
```

> ⚠️ **Relire est le vrai test.** MinIO (dev local et NAS) **accepte cette règle et en jette la
> clause en silence** : mesuré sur `RELEASE.2025-09-07`, une règle réduite à
> `AbortIncompleteMultipartUpload` part en 400, et accompagnée d'une `Expiration` elle est acceptée
> puis relue **sans** la clause — confirmé par le SDK AWS *et* par `mc ilm export`. Si
> `AbortIncompleteMultipartUpload` ne revient pas dans la réponse du `get`, la règle ne fait rien.
> C'est la dette **U-6** de `docs/dette-technique.md`.

Le dev n'a donc aucun filet, et c'est assumé : son volume MinIO est jetable
(`docker compose down -v`), les parts orphelines n'y coûtent rien. Pour voir ce qui traîne sur un
bucket, quel qu'il soit :

```bash
aws s3api list-multipart-uploads --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"
```
